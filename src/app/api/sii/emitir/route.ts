/**
 * SII DTE Emission API Endpoint
 * POST /api/sii/emitir
 * 
 * Orchestrates the complete DTE emission process:
 * 1. Read SII configuration from DB (mock for now)
 * 2. Get next available folio from CAF
 * 3. Build DTE XML
 * 4. Sign XML with certificate
 * 5. Send to SII (mock for demo)
 * 6. Update stock if successful
 * 7. Save DTE document to history
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildDteXML, calculateIVA, calculateNetoFromTotal, DteData, DteItem } from '@/domain/logic/sii/dteBuilder';
import { signXML } from '@/domain/logic/sii/crypto';
import { getSiiEmissionConfig } from '@/lib/sii-config';
import { requireApiRoles } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import { API_NO_STORE_HEADERS } from '@/lib/api-cache';
// In production, import DB client:
// import { db } from '@/domain/db/client';

interface EmitirRequest {
    tipo: 33 | 39; // Factura or Boleta
    items: {
        sku: string;
        nombre: string;
        cantidad: number;
        precio: number;
    }[];
    cliente?: {
        rut: string;
        razonSocial: string;
        direccion?: string;
        comuna?: string;
    };
    metodoPago: 'CASH' | 'DEBIT' | 'CREDIT' | 'TRANSFER';
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const SII_EMIT_ROLES = ['ADMIN', 'GERENTE_GENERAL', 'MANAGER', 'QF'] as const;
const MAX_SII_EMIT_BODY_BYTES = 256 * 1024;
const ENABLE_SII_EMISSION_API_FLAG = 'ENABLE_SII_EMISSION_API';

function getDeclaredContentLength(request: NextRequest) {
    const raw = request.headers.get('content-length');
    if (!raw) return null;

    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isProductionLikeRuntime() {
    return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

function isSiiEmissionApiEnabled() {
    return !isProductionLikeRuntime() || process.env[ENABLE_SII_EMISSION_API_FLAG] === 'true';
}

const EmitirRequestSchema = z.object({
    tipo: z.union([z.literal(33), z.literal(39)]),
    items: z.array(z.object({
        sku: z.string().min(1).max(120),
        nombre: z.string().min(1).max(255),
        cantidad: z.number().int().positive(),
        precio: z.number().positive(),
    })).min(1, 'Debe incluir al menos un ítem'),
    cliente: z.object({
        rut: z.string().min(3).max(32),
        razonSocial: z.string().min(2).max(255),
        direccion: z.string().min(2).max(255).optional(),
        comuna: z.string().min(2).max(120).optional(),
    }).optional(),
    metodoPago: z.enum(['CASH', 'DEBIT', 'CREDIT', 'TRANSFER']),
});

export async function POST(request: NextRequest) {
    const auth = await requireApiRoles(SII_EMIT_ROLES);
    if (!auth.ok) {
        return auth.response;
    }

    try {
        if (!isSiiEmissionApiEnabled()) {
            return NextResponse.json({
                success: false,
                error: 'SII_EMISSION_DISABLED',
                message: 'Emisión SII deshabilitada hasta conectar CAF/SII real',
            }, { status: 501, headers: API_NO_STORE_HEADERS });
        }

        const declaredContentLength = getDeclaredContentLength(request);
        if (declaredContentLength !== null && declaredContentLength > MAX_SII_EMIT_BODY_BYTES) {
            return NextResponse.json({
                success: false,
                error: 'PAYLOAD_TOO_LARGE',
                message: 'El payload de emisión supera el límite permitido',
            }, { status: 413, headers: API_NO_STORE_HEADERS });
        }

        const bodyResult = await request.json().catch(() => null);
        const parsedBody = EmitirRequestSchema.safeParse(bodyResult);
        if (!parsedBody.success) {
            return NextResponse.json({
                success: false,
                error: 'INVALID_PAYLOAD',
                message: parsedBody.error.issues[0]?.message || 'Payload inválido',
            }, { status: 400, headers: API_NO_STORE_HEADERS });
        }

        const body: EmitirRequest = parsedBody.data;

        // STEP 1: Load SII Configuration (server-side only)
        const siiConfig = await getSiiEmissionConfig();

        // STEP 2: Get next folio (MOCK)
        // In production: const caf = await db.query('SELECT * FROM sii_cafs WHERE tipo_dte = $1 AND active = true AND folios_usados < (rango_hasta - rango_desde) ORDER BY fecha_carga LIMIT 1', [body.tipo]);
        const mockCaf = {
            id: '1',
            tipo_dte: body.tipo,
            xml_content: '<CAF>MOCK_CAF_CONTENT</CAF>',
            rango_desde: 1,
            rango_hasta: 1000,
            folios_usados: 42,
            fecha_carga: Date.now(),
            active: true
        };

        const nextFolio = mockCaf.rango_desde + mockCaf.folios_usados;

        // Check if folios are available
        if (mockCaf.folios_usados >= (mockCaf.rango_hasta - mockCaf.rango_desde)) {
            return NextResponse.json({
                success: false,
                error: 'NO_FOLIOS',
                message: '⛔ No hay folios disponibles. Contacte a Gerencia.'
            }, { status: 400, headers: API_NO_STORE_HEADERS });
        }

        // STEP 3: Build DTE
        const total = body.items.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
        const neto = calculateNetoFromTotal(total);
        const iva = calculateIVA(neto);

        const dteItems: DteItem[] = body.items.map((item, index) => ({
            numeroLinea: index + 1,
            nombre: item.nombre,
            cantidad: item.cantidad,
            precioUnitario: item.precio,
            montoTotal: item.precio * item.cantidad
        }));

        const dteData: DteData = {
            tipo: body.tipo,
            folio: nextFolio,
            fechaEmision: new Date().toISOString().split('T')[0],

            rutEmisor: siiConfig.rutEmisor,
            razonSocialEmisor: siiConfig.razonSocial,
            giroEmisor: siiConfig.giro,
            acteco: siiConfig.acteco,
            direccionEmisor: 'Calle Principal 123',
            comunaEmisor: 'Vallenar',

            rutReceptor: body.cliente?.rut,
            razonSocialReceptor: body.cliente?.razonSocial,
            direccionReceptor: body.cliente?.direccion,
            comunaReceptor: body.cliente?.comuna,

            items: dteItems,

            montoNeto: neto,
            montoExento: 0,
            iva,
            montoTotal: total
        };

        const dteXml = buildDteXML(dteData, mockCaf);

        // STEP 4: Sign XML
        const signResult = await signXML(
            dteXml,
            siiConfig.certificatePfxBase64,
            siiConfig.certificatePassword
        );

        if (!signResult.success) {
            return NextResponse.json({
                success: false,
                error: 'SIGNATURE_ERROR',
                message: 'No se pudo firmar el DTE'
            }, { status: 500, headers: API_NO_STORE_HEADERS });
        }

        // STEP 5: Send to SII (MOCK)
        // In production: const siiResponse = await sendToSII(signResult.signedXml, siiConfig.ambiente);
        const mockTrackId = `TRACK_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        logger.info({
            tipo: body.tipo,
            folio: nextFolio,
            trackId: mockTrackId,
            total
        }, 'DTE enviado al SII (MOCK)');

        // STEP 6: Update stock (MOCK)
        // In production: Update inventory_batches
        logger.info({ tipo: body.tipo, folio: nextFolio }, 'Stock actualizado por emisión DTE (MOCK)');

        // STEP 7: Save DTE to history (MOCK)
        // In production: INSERT INTO dte_documents

        // Update CAF folio counter (MOCK)
        // In production: UPDATE sii_cafs SET folios_usados = folios_usados + 1 WHERE id = $1

        return NextResponse.json({
            success: true,
            data: {
                tipo: body.tipo,
                folio: nextFolio,
                trackId: mockTrackId,
                fecha: dteData.fechaEmision,
                total,
                xmlAvailable: Boolean(signResult.signedXml),
                pdfUrl: `/api/sii/pdf/${body.tipo}/${nextFolio}` // Future endpoint
            }
        }, { headers: API_NO_STORE_HEADERS });

    } catch (error) {
        logger.error(
            {
                error: error instanceof Error ? error.message : String(error),
            },
            'Error emitiendo DTE'
        );
        return NextResponse.json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: 'No se pudo emitir el DTE'
        }, { status: 500, headers: API_NO_STORE_HEADERS });
    }
}
