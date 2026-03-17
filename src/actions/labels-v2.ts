'use server';

import { pool } from '@/lib/db';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';

// ============================================================================
// LABELS V2 — Generación de Etiquetas para Impresión
// ============================================================================

const logger = {
    error: (data: Record<string, unknown>, msg: string) => {
        Sentry.captureMessage(msg, { level: 'error', extra: data });
    },
};

export interface LabelItem {
    productName: string;
    sku: string;
    barcode?: string;
    salePrice: number;
    unitPrice?: number;
    expiryDate?: string;
    lotNumber?: string;
    laboratory?: string;
    quantity?: number; // Cuántas etiquetas imprimir
}

export interface LabelConfig {
    size: '50x25' | '100x50';
    showBarcode: boolean;
    showExpiry: boolean;
    showLot: boolean;
    showLab: boolean;
    copies: number;
}

const UUIDSchema = z.string().uuid('ID inválido');

const LabelItemSchema = z.object({
    productName: z.string().min(1),
    sku: z.string().min(1),
    barcode: z.string().optional(),
    salePrice: z.number().nonnegative(),
    unitPrice: z.number().nonnegative().optional(),
    expiryDate: z.string().optional(),
    lotNumber: z.string().optional(),
    laboratory: z.string().optional(),
    quantity: z.number().int().positive().optional(),
});

const LabelConfigSchema = z.object({
    size: z.enum(['50x25', '100x50']),
    showBarcode: z.boolean(),
    showExpiry: z.boolean(),
    showLot: z.boolean(),
    showLab: z.boolean(),
    copies: z.number().int().positive(),
});

const GenerateLabelsHTMLSchema = z.object({
    items: z.array(LabelItemSchema).min(1),
    config: LabelConfigSchema.optional(),
});

const GetLabelsForReceptionSchema = z.object({
    orderId: UUIDSchema,
});

const GetFEFOBatchesSchema = z.object({
    productId: UUIDSchema,
    locationId: UUIDSchema.optional(),
    limit: z.number().int().min(1).max(100).optional().default(10),
});

// ============================================================================
// 1. Generar HTML de etiquetas para impresión
// ============================================================================
export async function generateLabelsHTML(
    items: LabelItem[],
    config: LabelConfig = { size: '50x25', showBarcode: true, showExpiry: true, showLot: true, showLab: false, copies: 1 }
): Promise<{ success: boolean; html?: string; error?: string }> {
    try {
        const validated = GenerateLabelsHTMLSchema.safeParse({ items, config });
        if (!validated.success) {
            return { success: false, error: 'Parámetros inválidos' };
        }

        const validItems = validated.data.items;
        const validConfig = validated.data.config || config;

        const is50x25 = validConfig.size === '50x25';
        const labelWidth = is50x25 ? '50mm' : '100mm';
        const labelHeight = is50x25 ? '25mm' : '50mm';
        const fontSize = is50x25 ? '7px' : '10px';
        const priceSize = is50x25 ? '14px' : '22px';
        const nameSize = is50x25 ? '8px' : '12px';

        const formatCLP = (n: number) =>
            new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

        let labelsHTML = '';

        for (const item of validItems) {
            const copies = item.quantity || validConfig.copies || 1;
            for (let c = 0; c < copies; c++) {
                labelsHTML += `
                    <div class="label" style="width:${labelWidth};height:${labelHeight};padding:2mm;box-sizing:border-box;border:0.5px dashed #ccc;page-break-inside:avoid;display:flex;flex-direction:column;justify-content:space-between;font-family:'Arial',sans-serif;">
                        <div style="font-size:${nameSize};font-weight:bold;color:#111;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                            ${item.productName}
                        </div>
                        ${validConfig.showLab && item.laboratory ? `<div style="font-size:${fontSize};color:#666;">${item.laboratory}</div>` : ''}
                        <div style="display:flex;justify-content:space-between;align-items:flex-end;">
                            <div>
                                <div style="font-size:${fontSize};color:#888;">SKU: ${item.sku}</div>
                                ${validConfig.showLot && item.lotNumber ? `<div style="font-size:${fontSize};color:#888;">Lote: ${item.lotNumber}</div>` : ''}
                                ${validConfig.showExpiry && item.expiryDate ? `<div style="font-size:${fontSize};color:#e11d48;font-weight:bold;">Venc: ${item.expiryDate}</div>` : ''}
                            </div>
                            <div style="text-align:right;">
                                <div style="font-size:${priceSize};font-weight:900;color:#0f172a;">
                                    ${formatCLP(item.salePrice)}
                                </div>
                                ${item.unitPrice && item.unitPrice !== item.salePrice ? `<div style="font-size:${fontSize};color:#888;">Unit: ${formatCLP(item.unitPrice)}</div>` : ''}
                            </div>
                        </div>
                        ${validConfig.showBarcode && item.barcode ? `
                            <div style="text-align:center;margin-top:1mm;">
                                <div style="font-family:'Libre Barcode 39',monospace;font-size:24px;letter-spacing:2px;">*${item.barcode}*</div>
                                <div style="font-size:6px;color:#999;">${item.barcode}</div>
                            </div>
                        ` : ''}
                    </div>
                `;
            }
        }

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Etiquetas de Productos</title>
                <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39&display=swap" rel="stylesheet">
                <style>
                    @page { margin: 2mm; }
                    body { margin: 0; padding: 0; }
                    .labels-container { display: flex; flex-wrap: wrap; gap: 0; }
                    @media print {
                        .no-print { display: none !important; }
                        .label { border: none !important; }
                    }
                </style>
            </head>
            <body>
                <div class="no-print" style="padding:10px;background:#f1f5f9;text-align:center;font-family:Arial;">
                    <button onclick="window.print()" style="padding:8px 24px;background:#0ea5e9;color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer;font-size:14px;">
                        🖨️ Imprimir Etiquetas
                    </button>
                    <span style="margin-left:12px;color:#64748b;font-size:13px;">${validItems.length} producto(s), ${validItems.reduce((s, i) => s + (i.quantity || 1), 0)} etiqueta(s)</span>
                </div>
                <div class="labels-container">
                    ${labelsHTML}
                </div>
            </body>
            </html>
        `;

        return { success: true, html };
    } catch (error) {
        logger.error({ error }, 'generateLabelsHTML error');
        return { success: false, error: 'Error al generar etiquetas' };
    }
}

// ============================================================================
// 2. Obtener datos de productos para etiquetas post-recepción
// ============================================================================
export async function getLabelsForReception(orderId: string): Promise<{
    success: boolean;
    items?: LabelItem[];
    error?: string;
}> {
    try {
        const validated = GetLabelsForReceptionSchema.safeParse({ orderId });
        if (!validated.success) {
            return { success: false, error: 'Parámetros inválidos' };
        }

        const validOrderId = validated.data.orderId;

        const res = await pool.query(`
            SELECT
                poi.sku,
                poi.name as product_name,
                poi.quantity_received,
                poi.cost_price,
                p.barcode,
                p.laboratory,
                COALESCE(NULLIF(p.sale_price, 0), NULLIF(p.price_sell_box, 0), NULLIF(p.price, 0), 0) as sale_price,
                COALESCE(p.price_per_unit, 0) as unit_price
            FROM purchase_order_items poi
            LEFT JOIN products p ON p.sku = poi.sku AND p.id ~ '^[0-9a-f]{8}-'
            WHERE poi.purchase_order_id::text = $1::text
              AND poi.quantity_received > 0
            ORDER BY poi.name
        `, [validOrderId]);

        const items: LabelItem[] = res.rows.map(row => ({
            productName: row.product_name,
            sku: row.sku,
            barcode: row.barcode?.split(',')[0]?.trim() || undefined,
            salePrice: Number(row.sale_price),
            unitPrice: Number(row.unit_price) || undefined,
            laboratory: row.laboratory || undefined,
            quantity: Number(row.quantity_received),
        }));

        return { success: true, items };
    } catch (error) {
        logger.error({ error }, 'getLabelsForReception error');
        return { success: false, error: 'Error al obtener datos para etiquetas' };
    }
}

// ============================================================================
// 3. Obtener lotes ordenados por FEFO (First Expired, First Out)
// ============================================================================
export async function getFEFOBatches(
    productId: string,
    locationId?: string,
    limit = 10
): Promise<{
    success: boolean;
    batches?: Array<{
        id: string;
        lot_number: string;
        quantity_real: number;
        expiry_date: string | null;
        days_until_expiry: number | null;
        is_priority: boolean;
    }>;
    error?: string;
}> {
    try {
        const validated = GetFEFOBatchesSchema.safeParse({ productId, locationId, limit });
        if (!validated.success) {
            return { success: false, error: 'Parámetros inválidos' };
        }

        const validProductId = validated.data.productId;
        const validLocationId = validated.data.locationId;
        const validLimit = validated.data.limit;

        const locationFilter = validLocationId ? 'AND ib.location_id::text = $2::text' : '';
        const params: (string | number)[] = [validProductId];
        if (validLocationId) params.push(validLocationId);
        params.push(validLimit);

        const res = await pool.query(`
            SELECT
                ib.id, ib.lot_number, ib.quantity_real,
                ib.expiry_date::text,
                CASE WHEN ib.expiry_date IS NOT NULL
                    THEN EXTRACT(DAY FROM (ib.expiry_date::timestamp - NOW()))::int
                    ELSE NULL
                END as days_until_expiry,
                CASE WHEN ib.expiry_date IS NOT NULL
                    AND ib.expiry_date::timestamp < NOW() + INTERVAL '90 days'
                    THEN true ELSE false
                END as is_priority
            FROM inventory_batches ib
            WHERE ib.product_id::text = $1::text
              AND ib.quantity_real > 0
              ${locationFilter}
            ORDER BY
                ib.expiry_date ASC NULLS LAST,
                ib.created_at ASC
            LIMIT $${params.length}
        `, params);

        return { success: true, batches: res.rows };
    } catch (error) {
        logger.error({ error }, 'getFEFOBatches error');
        return { success: true, batches: [] };
    }
}
