import { randomUUID } from 'crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { PoolClient } from 'pg';

import { resolveWarehouseForInventoryActor } from '@/actions/inventory-scope';
import { InventoryBatch } from '@/domain/types';
import { INVENTORY_API_ROLES, requireApiRoles } from '@/lib/api-auth';
import { pool } from '@/lib/db';
import { logger } from '@/lib/logger';
import { normalizeRole } from '@/lib/pin-rbac';

const UUIDSchema = z.string().uuid();

function toFiniteNumber(value: unknown, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function toPositiveInteger(value: unknown, fallback = 0) {
    return Math.max(0, Math.trunc(toFiniteNumber(value, fallback)));
}

function normalizeOptionalText(value: unknown) {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
}

function normalizeOptionalUuid(value: unknown) {
    const text = normalizeOptionalText(value);
    if (!text) {
        return undefined;
    }

    return UUIDSchema.safeParse(text).success ? text : undefined;
}

function normalizeExpiryDate(value: unknown) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value;
    }

    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }

    if (typeof value === 'string' && value.trim()) {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }

    return undefined;
}

async function syncProductStockSummary(
    client: PoolClient,
    productId: string,
) {
    await client.query(
        `
            WITH totals AS (
                SELECT COALESCE(SUM(quantity_real), 0) AS total_stock
                FROM inventory_batches
                WHERE product_id::text = $1::text
            )
            UPDATE products
            SET stock_total = totals.total_stock,
                stock_actual = totals.total_stock,
                updated_at = NOW()
            FROM totals
            WHERE id::text = $1::text
        `,
        [productId],
    );
}

export async function POST(request: Request) {
    const auth = await requireApiRoles(INVENTORY_API_ROLES);
    if (!auth.ok) {
        return auth.response;
    }

    let productCount = 0;

    try {
        const body = await request.json();
        const { products } = body as { products: InventoryBatch[] };

        if (!products || !Array.isArray(products) || products.length === 0) {
            return NextResponse.json({ error: 'No products provided' }, { status: 400 });
        }

        const actor = {
            ...auth.session,
            role: normalizeRole(auth.session.role),
        };

        const client = await pool.connect();
        productCount = products.length;

        try {
            logger.info({ productCount }, '[InventoryBatchRoute] Starting canonical bulk import');
            await client.query('BEGIN');

            for (const rawProduct of products) {
                const sku = normalizeOptionalText(rawProduct.sku);
                const name = normalizeOptionalText(rawProduct.name);
                if (!sku || !name) {
                    await client.query('ROLLBACK');
                    return NextResponse.json(
                        { error: 'Cada fila debe incluir SKU y nombre', code: 'BATCH_IMPORT_VALIDATION' },
                        { status: 400 },
                    );
                }

                const requestedLocationId =
                    normalizeOptionalUuid(rawProduct.location_id) ||
                    normalizeOptionalUuid(auth.session.locationId);

                if (!requestedLocationId) {
                    await client.query('ROLLBACK');
                    return NextResponse.json(
                        { error: 'No se pudo resolver la ubicación del import', code: 'BATCH_IMPORT_SCOPE' },
                        { status: 403 },
                    );
                }

                const warehouseScope = await resolveWarehouseForInventoryActor(
                    actor,
                    normalizeOptionalUuid(rawProduct.warehouse_id),
                    requestedLocationId,
                    client,
                );

                if (!warehouseScope.success || !warehouseScope.locationId) {
                    await client.query('ROLLBACK');
                    return NextResponse.json(
                        { error: warehouseScope.success ? 'No se pudo resolver la bodega' : warehouseScope.error, code: 'BATCH_IMPORT_SCOPE' },
                        { status: 403 },
                    );
                }

                const effectiveLocationId = warehouseScope.locationId;
                const effectiveWarehouseId = warehouseScope.warehouseId;

                const cost = toFiniteNumber(rawProduct.cost_net ?? rawProduct.cost_price, 0);
                const priceToSave = toFiniteNumber(rawProduct.price ?? rawProduct.price_sell_box, 0);
                const quantityToImport = toPositiveInteger(rawProduct.stock_actual, 0);
                const unitsPerBox = Math.max(1, toPositiveInteger(rawProduct.units_per_box, 1));
                const expiryDate = normalizeExpiryDate(rawProduct.expiry_date);
                const lotNumber = normalizeOptionalText(rawProduct.lot_number) || 'IMPORT-GENERAL';

                const productInsertId = UUIDSchema.safeParse(rawProduct.id).success
                    ? rawProduct.id
                    : randomUUID();

                const productUpsertRes = await client.query(
                    `
                        INSERT INTO products (
                            id, sku, name, dci, laboratory,
                            price, price_sell_box, cost_net, location_id,
                            stock_total, stock_actual,
                            format, is_bioequivalent, category,
                            description, therapeutic_action, units_per_box, isp_register,
                            condicion_venta, barcode, concentration, price_sell_unit,
                            is_active, updated_at
                        )
                        VALUES (
                            $1::uuid, $2, $3, $4, $5,
                            $6, $7, $8, $9,
                            0, 0,
                            $10, $11, $12,
                            $13, $14, $15, $16,
                            $17, $18, $19, $20,
                            true, NOW()
                        )
                        ON CONFLICT (sku) DO UPDATE SET
                            name = EXCLUDED.name,
                            dci = EXCLUDED.dci,
                            laboratory = EXCLUDED.laboratory,
                            price = EXCLUDED.price,
                            price_sell_box = EXCLUDED.price_sell_box,
                            cost_net = EXCLUDED.cost_net,
                            location_id = COALESCE(NULLIF(products.location_id::text, ''), EXCLUDED.location_id)::text,
                            description = EXCLUDED.description,
                            therapeutic_action = EXCLUDED.therapeutic_action,
                            units_per_box = EXCLUDED.units_per_box,
                            isp_register = EXCLUDED.isp_register,
                            condicion_venta = EXCLUDED.condicion_venta,
                            barcode = EXCLUDED.barcode,
                            concentration = EXCLUDED.concentration,
                            price_sell_unit = EXCLUDED.price_sell_unit,
                            format = EXCLUDED.format,
                            is_bioequivalent = EXCLUDED.is_bioequivalent,
                            category = EXCLUDED.category,
                            updated_at = NOW()
                        RETURNING id::text AS id
                    `,
                    [
                        productInsertId,
                        sku,
                        name,
                        normalizeOptionalText(rawProduct.dci) || '',
                        normalizeOptionalText(rawProduct.laboratory) || 'GENERICO',
                        priceToSave,
                        priceToSave,
                        cost,
                        effectiveLocationId,
                        normalizeOptionalText(rawProduct.format) || 'UNIDAD',
                        Boolean(rawProduct.is_bioequivalent),
                        normalizeOptionalText(rawProduct.category) || 'MEDICAMENTO',
                        normalizeOptionalText(rawProduct.description) || '',
                        normalizeOptionalText(rawProduct.therapeutic_action) || '',
                        unitsPerBox,
                        normalizeOptionalText(rawProduct.isp_register) || '',
                        normalizeOptionalText(rawProduct.condition) || 'VD',
                        normalizeOptionalText(rawProduct.barcode) || sku,
                        normalizeOptionalText(rawProduct.concentration) || '',
                        toFiniteNumber(rawProduct.price_sell_unit, unitsPerBox > 0 ? priceToSave / unitsPerBox : priceToSave),
                    ],
                );

                const productId = String(productUpsertRes.rows[0]?.id || '');
                if (!productId) {
                    throw new Error(`No se pudo resolver productId para SKU ${sku}`);
                }

                const existingBatchRes = await client.query(
                    `
                        SELECT id::text AS id
                        FROM inventory_batches
                        WHERE product_id::text = $1::text
                          AND location_id::text = $2::text
                          AND COALESCE(warehouse_id::text, '') = COALESCE($3::text, '')
                          AND COALESCE(lot_number, '') = $4
                          AND COALESCE(is_retail_lot, false) = false
                        LIMIT 1
                        FOR UPDATE
                    `,
                    [productId, effectiveLocationId, effectiveWarehouseId || '', lotNumber],
                );

                if ((existingBatchRes.rowCount ?? 0) > 0) {
                    await client.query(
                        `
                            UPDATE inventory_batches
                            SET quantity_real = quantity_real + $1,
                                unit_cost = $2,
                                cost_net = $2,
                                sale_price = $3,
                                price_sell_box = $3,
                                price_sell_unit = $4,
                                units_per_box = $5,
                                expiry_date = COALESCE($6, expiry_date),
                                stock_min = GREATEST(COALESCE(stock_min, 0), 0),
                                stock_max = GREATEST(COALESCE(stock_max, 1), 1),
                                source_system = 'BULK_IMPORT',
                                updated_at = NOW()
                            WHERE id::text = $7::text
                        `,
                        [
                            quantityToImport,
                            cost,
                            priceToSave,
                            toFiniteNumber(rawProduct.price_sell_unit, unitsPerBox > 0 ? priceToSave / unitsPerBox : priceToSave),
                            unitsPerBox,
                            expiryDate || null,
                            String(existingBatchRes.rows[0]?.id || ''),
                        ],
                    );
                } else {
                    await client.query(
                        `
                            INSERT INTO inventory_batches (
                                id, product_id, sku, name,
                                location_id, warehouse_id,
                                quantity_real, expiry_date, lot_number,
                                unit_cost, cost_net,
                                sale_price, price_sell_box, price_sell_unit,
                                stock_min, stock_max,
                                units_per_box, is_fractionable, source_system
                            ) VALUES (
                                $1::uuid, $2::uuid, $3, $4,
                                $5::uuid, $6::uuid,
                                $7, $8, $9,
                                $10, $10,
                                $11, $11, $12,
                                0, 1000,
                                $13, true, 'BULK_IMPORT'
                            )
                        `,
                        [
                            randomUUID(),
                            productId,
                            sku,
                            name,
                            effectiveLocationId,
                            effectiveWarehouseId,
                            quantityToImport,
                            expiryDate || null,
                            lotNumber,
                            cost,
                            priceToSave,
                            toFiniteNumber(rawProduct.price_sell_unit, unitsPerBox > 0 ? priceToSave / unitsPerBox : priceToSave),
                            unitsPerBox,
                        ],
                    );
                }

                await syncProductStockSummary(client, productId);
            }

            await client.query('COMMIT');
            logger.info({ productCount }, '[InventoryBatchRoute] Canonical bulk import committed successfully');
            return NextResponse.json({ success: true, count: products.length });
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error({ error, productCount }, '[InventoryBatchRoute] Canonical bulk import failed');
            return NextResponse.json(
                {
                    error: 'Failed to import batch',
                    code: 'BATCH_IMPORT_FAILED',
                },
                { status: 500 },
            );
        } finally {
            client.release();
        }
    } catch (error) {
        logger.error({ error, productCount }, '[InventoryBatchRoute] Request parsing failed');
        return NextResponse.json(
            {
                error: 'Failed to import batch',
                code: 'BATCH_IMPORT_FAILED',
            },
            { status: 500 },
        );
    }
}
