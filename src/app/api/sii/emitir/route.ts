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
import { buildDteXML, calculateIVA, calculateNetoFromTotal, DteData, DteItem } from '@/domain/logic/sii/dteBuilder';
import { signXML } from '@/domain/logic/sii/crypto';
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

export async function POST(request: NextRequest) {
    try {
        const body: EmitirRequest = await request.json();

        // STEP 1: Load SII Configuration (MOCK for demo)
        // In production: const config = await db.query('SELECT * FROM sii_configuration LIMIT 1');
        const mockConfig = {
            id: '1',
            rut_emisor: '76.123.456-7',
            razon_social: 'FARMACIAS VALLENAR LTDA',
            giro: 'VENTA AL POR MENOR DE PRODUCTOS FARMACEUTICOS',
            acteco: 477310,
            certificado_pfx_base64: 'MOCK_CERT',
            certificado_password: 'MOCK_PASS',
            fecha_vencimiento_firma: Date.now() + 365 * 24 * 60 * 60 * 1000,
            ambiente: 'CERTIFICACION' as const,
            direccionEmisor: 'Calle Principal 123',
            comunaEmisor: 'Vallenar'
        };

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
            }, { status: 400 });
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

            rutEmisor: mockConfig.rut_emisor,
            razonSocialEmisor: mockConfig.razon_social,
            giroEmisor: mockConfig.giro,
            acteco: mockConfig.acteco,
            direccionEmisor: mockConfig.direccionEmisor,
            comunaEmisor: mockConfig.comunaEmisor,

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
            mockConfig.certificado_pfx_base64,
            mockConfig.certificado_password
        );

        if (!signResult.success) {
            return NextResponse.json({
                success: false,
                error: 'SIGNATURE_ERROR',
                message: signResult.error
            }, { status: 500 });
        }

        // STEP 5: Send to SII (MOCK)
        // In production: const siiResponse = await sendToSII(signResult.signedXml, mockConfig. ambiente);
        const mockTrackId = `TRACK_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        console.log('📤 DTE enviado al SII (MOCK):', {
            tipo: body.tipo,
            folio: nextFolio,
            trackId: mockTrackId,
            total
        });

        // STEP 6: Update stock (MOCK)
        // In production: Update inventory_batches
        console.log('📦 Stock actualizado (MOCK)');

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
                xml: signResult.signedXml,
                pdfUrl: `/api/sii/pdf/${body.tipo}/${nextFolio}` // Future endpoint
            }
        });

    } catch (error) {
        console.error('Error emitiendo DTE:', error);
        return NextResponse.json({
            success: false,
            error: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Error desconocido'
        }, { status: 500 });
    }
}
