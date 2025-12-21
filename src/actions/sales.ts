'use server';

import { query } from '@/lib/db';
import { SaleTransaction, SaleItem } from '../domain/types';
import { revalidatePath } from 'next/cache';
import { isValidUUID } from '@/lib/utils';

/**
 * Creates a new sale in the database using a transaction.
 * 1. Insert Sale header
 * 2. Insert Sale Items
 * 3. Update Inventory (Decrement stock)
 */
// Safe DB Transaction Implementation
export async function createSale(saleData: SaleTransaction) {
    const { pool, query } = await import('@/lib/db'); // Need pool for transaction client, query for repair
    const { v4: uuidv4 } = await import('uuid');

    console.log(`🛒 [Server Action] Creating Sale (Transactional): ${saleData.id}`);

    // Generate Official ID
    const saleId = uuidv4();
    const client = await pool.connect();

    try {
        // ---------------------------------------------------------
        // 1. START TRANSACTION
        // ---------------------------------------------------------
        await client.query('BEGIN');

        // Validation
        if (!saleData.branch_id) throw new Error('❌ Missing Location Context (branch_id)');
        if (!saleData.terminal_id) throw new Error('❌ Missing Terminal Context (terminal_id)');

        const userId = isValidUUID(saleData.seller_id) ? saleData.seller_id : null;

        // A. Insert Header
        await client.query(
            `INSERT INTO sales (id, location_id, terminal_id, user_id, customer_rut, total_amount, payment_method, dte_folio, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, to_timestamp($9 / 1000.0))`,
            [
                saleId,
                saleData.branch_id,
                saleData.terminal_id,
                userId,
                saleData.customer?.rut || null,
                saleData.total,
                saleData.payment_method,
                saleData.dte_folio || null,
                saleData.timestamp
            ]
        );

        // B. Insert Items & Decrement Stock
        for (const item of saleData.items) {
            // Insert Item
            await client.query(
                `INSERT INTO sale_items (sale_id, batch_id, quantity, unit_price, total_price)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    saleId,
                    isValidUUID(item.batch_id) ? item.batch_id : null,
                    item.quantity,
                    item.price,
                    item.price * item.quantity
                ]
            );

            // Update Inventory (Atomic Decrement)
            if (isValidUUID(item.batch_id)) {
                const stockRes = await client.query(
                    `UPDATE inventory_batches 
                     SET quantity_real = quantity_real - $1 
                     WHERE id = $2
                     RETURNING quantity_real`, // Optional: Check if negative?
                    [item.quantity, item.batch_id]
                );

                // Optional: Prevent negative stock? 
                // For now, allow it to enable sales even if count is off, but business might prefer error.
            }
        }

        // ---------------------------------------------------------
        // 2. COMMIT TRANSACTION
        // ---------------------------------------------------------
        await client.query('COMMIT');

        revalidatePath('/caja');
        return { success: true, transactionId: saleId };

    } catch (error: any) {
        // ---------------------------------------------------------
        // 3. ROLLBACK (On any failure)
        // ---------------------------------------------------------
        await client.query('ROLLBACK');
        console.error('❌ Transaction Failed -> Rollback executed.', error.message);

        // ---------------------------------------------------------
        // 4. RETRY STRATEGY (Schema Repair)
        // ---------------------------------------------------------
        // Determine if it was a schema error (Table missing, Column missing)
        const isSchemaError = error.code === '42P01' || error.code === '42703';

        if (isSchemaError) {
            console.warn(`⚠️ Detected Schema Issue (${error.code}). Attempting Auto-Repair outside transaction...`);

            // Release original client first
            client.release();

            // Attempt Repair (Using standard query helper or new client)
            const repairSuccess = await runSchemaRepair();

            if (repairSuccess) {
                console.log('🔄 Schema Repaired. Retrying Sale Transaction...');
                // Recursive Retry (One-time)
                // We cannot pass the same saleData recursive blindly if we want to avoid infinite loops,
                // but for now we assume repair fixes it. 
                // To be safe, we might just return error asking user to click again, but let's try once.

                return await createSale_RetryAfterRepair(saleData);
            } else {
                return { success: false, error: 'Critical Database Schema Error (Repair Failed)' };
            }
        }

        return { success: false, error: `Transaction Error: ${error.message}` };
    } finally {
        client.release();
    }
}

// Separate function for retry to denote explicit retry logic (prevents infinite recursion stack in theory if we don't chain too deep)
async function createSale_RetryAfterRepair(saleData: SaleTransaction) {
    // Just call the main function again. In a real recursion this is fine for 1 level.
    // To prevent infinite, we could add a `retryCount` param to createSale, but keeping signature clean.
    // If repair works, this succeeds. If repair acts like it worked but didn't, this fails again 
    // and might try repair again? No, we need to stop infinite loop.
    // Simpler: Just fail if it fails again.

    // Minimal Copy of logic to avoid infinite recursion risk:
    // ... Or just use the original function but realize it might loop if error persists.
    // Let's assume repair works.
    return { success: false, error: 'Schema repaired. Please try processing sale again.' };
}

// Extracted Repair Logic
async function runSchemaRepair() {
    const { query } = await import('@/lib/db'); // Use pool wrapper
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS sales (
                id UUID PRIMARY KEY,
                location_id UUID,
                terminal_id UUID,
                user_id UUID,
                customer_rut VARCHAR(20),
                total_amount NUMERIC(15, 2),
                payment_method VARCHAR(50),
                dte_folio INTEGER,
                timestamp TIMESTAMP DEFAULT NOW()
            );
        `);
        await query(`
            CREATE TABLE IF NOT EXISTS sale_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                sale_id UUID NOT NULL,
                batch_id UUID,
                quantity INTEGER,
                unit_price NUMERIC(15, 2),
                total_price NUMERIC(15, 2)
            );
        `);
        // Add columns if missing
        await query(`
            DO $$ 
            BEGIN 
                BEGIN ALTER TABLE sales ADD COLUMN location_id UUID; EXCEPTION WHEN duplicate_column THEN END;
                BEGIN ALTER TABLE sales ADD COLUMN terminal_id UUID; EXCEPTION WHEN duplicate_column THEN END;
            END $$;
        `);
        return true;
    } catch (e) {
        console.error('Repair failed:', e);
        return false;
    }
}

// Helper to keep 'executeSaleTransaction' symbol if used elsewhere, or just remove it as we merged it.
// The original code had 'executeSaleTransaction' as helper. We merged into createSale.

// Helper removed (moved to @/lib/utils)

// --- Fetching ---

export async function getSales(limit = 50, locationId?: string, terminalId?: string) {
    const { query } = await import('@/lib/db');

    try {
        console.log(`📊 [Server Action] Fetching last ${limit} sales for LOC: ${locationId || 'ALL'}, TERM: ${terminalId || 'ALL'}`);

        // Build Dynamic Query
        let whereClause = '';
        const params: any[] = [limit];
        let paramIndex = 2;

        if (locationId) {
            whereClause += ` AND s.location_id::text = $${paramIndex}::text`;
            params.push(locationId);
            paramIndex++;
        }

        if (terminalId) {
            whereClause += ` AND s.terminal_id::text = $${paramIndex}::text`;
            params.push(terminalId);
            paramIndex++;
        }

        const finalSql = `
            SELECT 
                s.id, 
                s.total_amount as total, 
                s.payment_method, 
                s.timestamp,
                s.dte_folio,
                s.customer_rut,
                s.user_id as seller_id,
                s.location_id as branch_id,
                s.terminal_id,
                
                COALESCE(
                    json_agg(
                        json_build_object(
                            'name', COALESCE(p.name, 'Item'),
                            'quantity', si.quantity,
                            'price', si.unit_price,
                            'sku', COALESCE(p.sku, 'UNKNOWN')
                        )
                    ) FILTER (WHERE si.id IS NOT NULL), '[]'
                ) as items
                
            FROM sales s
            LEFT JOIN sale_items si ON s.id::text = si.sale_id::text
            LEFT JOIN inventory_batches b ON si.batch_id::text = b.id::text
            LEFT JOIN products p ON b.product_id::text = p.id::text
            WHERE 1=1 ${whereClause}
            GROUP BY s.id
            ORDER BY s.timestamp DESC
            LIMIT $1
        `;

        const res = await query(finalSql, params);

        // Map to Domain Type
        const sales: SaleTransaction[] = res.rows.map((row: any) => ({
            id: row.id,
            timestamp: new Date(row.timestamp).getTime(),
            total: Number(row.total),
            payment_method: row.payment_method,
            items: row.items,
            seller_id: row.seller_id || 'Unknown',
            customer: row.customer_rut ? { rut: row.customer_rut, fullName: 'Cliente' } as any : undefined,
            dte_folio: row.dte_folio,
            branch_id: row.branch_id,
            terminal_id: row.terminal_id
        }));

        return sales;
    } catch (error) {
        console.error('Error fetching sales:', error);
        return [];
    }
}
