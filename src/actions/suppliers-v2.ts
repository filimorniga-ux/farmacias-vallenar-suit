'use server';

/**
 * SUPPLIERS-V2: Secure Supplier Management Module
 * Pharma-Synapse v3.1 - Security Hardened
 */

import { pool } from '@/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';

// Validation
const UUIDSchema = z.string().uuid('ID inválido');

function validateRUT(rut: string): boolean {
    const cleanRUT = rut.replace(/\./g, '').replace(/-/g, '').toUpperCase();
    if (cleanRUT.length < 8 || cleanRUT.length > 9) return false;
    const body = cleanRUT.slice(0, -1);
    const dv = cleanRUT.slice(-1);
    let sum = 0, multiplier = 2;
    for (let i = body.length - 1; i >= 0; i--) {
        sum += parseInt(body[i]) * multiplier;
        multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }
    const expectedDV = 11 - (sum % 11);
    const expectedChar = expectedDV === 11 ? '0' : expectedDV === 10 ? 'K' : expectedDV.toString();
    return dv === expectedChar;
}

const RUTSchema = z.string().min(8).max(12).refine(validateRUT, 'RUT inválido');

const CreateSupplierSchema = z.object({
    rut: RUTSchema,
    businessName: z.string().min(2).max(200),
    fantasyName: z.string().max(200).optional(),
    contactEmail: z.string().email().optional(),
    phone: z.string().max(20).optional(),
    address: z.string().max(500).optional(),
    userId: UUIDSchema,
});

const DeactivateSupplierSchema = z.object({
    supplierId: UUIDSchema,
    reason: z.string().min(10),
    userId: UUIDSchema,
});

export async function createSupplierSecure(data: z.infer<typeof CreateSupplierSchema>) {
    const validated = CreateSupplierSchema.safeParse(data);
    if (!validated.success) return { success: false, error: validated.error.issues[0]?.message };

    const client = await pool.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        const existing = await client.query('SELECT id FROM suppliers WHERE rut = $1', [validated.data.rut]);
        if (existing.rows.length > 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'RUT ya existe' };
        }
        const supplierId = randomUUID();
        await client.query(`
            INSERT INTO suppliers (id, rut, business_name, fantasy_name, contact_email, phone, address, is_active, status, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'ACTIVE', NOW())
        `, [supplierId, validated.data.rut, validated.data.businessName, validated.data.fantasyName, validated.data.contactEmail, validated.data.phone, validated.data.address]);
        await client.query(`INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at) VALUES ($1, 'SUPPLIER_CREATED', 'SUPPLIER', $2, $3::jsonb, NOW())`,
            [validated.data.userId, supplierId, JSON.stringify({ rut: validated.data.rut, name: validated.data.businessName })]);
        await client.query('COMMIT');
        revalidatePath('/proveedores');
        return { success: true, data: { supplierId } };
    } catch (e: any) {
        await client.query('ROLLBACK');
        return { success: false, error: e.message };
    } finally {
        client.release();
    }
}

export async function deactivateSupplierSecure(data: z.infer<typeof DeactivateSupplierSchema>) {
    const validated = DeactivateSupplierSchema.safeParse(data);
    if (!validated.success) return { success: false, error: validated.error.issues[0]?.message };

    const client = await pool.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        await client.query(`UPDATE suppliers SET is_active = false, status = 'INACTIVE', deactivated_at = NOW(), deactivation_reason = $1 WHERE id = $2`,
            [validated.data.reason, validated.data.supplierId]);
        await client.query(`INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at) VALUES ($1, 'SUPPLIER_DEACTIVATED', 'SUPPLIER', $2, $3::jsonb, NOW())`,
            [validated.data.userId, validated.data.supplierId, JSON.stringify({ reason: validated.data.reason })]);
        await client.query('COMMIT');
        revalidatePath('/proveedores');
        return { success: true };
    } catch (e: any) {
        await client.query('ROLLBACK');
        return { success: false, error: e.message };
    } finally {
        client.release();
    }
}

export async function getSuppliersListSecure() {
    try {
        const result = await pool.query(`SELECT id, rut, COALESCE(NULLIF(fantasy_name,''), business_name) as name, status FROM suppliers WHERE is_active = true ORDER BY name`);
        return { success: true, data: result.rows };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// Schema para actualización de proveedor
const UpdateSupplierSchema = z.object({
    businessName: z.string().min(2).optional(),
    fantasyName: z.string().optional(),
    contactEmail: z.string().email().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
});

export async function updateSupplierSecure(
    supplierId: string,
    data: z.infer<typeof UpdateSupplierSchema>
): Promise<{ success: boolean; error?: string }> {
    if (!supplierId || !z.string().uuid().safeParse(supplierId).success) {
        return { success: false, error: 'ID de proveedor inválido' };
    }

    const validated = UpdateSupplierSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Verificar que existe
        const existing = await client.query('SELECT id FROM suppliers WHERE id = $1', [supplierId]);
        if (existing.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Proveedor no encontrado' };
        }

        // Construir updates dinámicamente
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (validated.data.businessName !== undefined) {
            updates.push(`business_name = $${paramIndex++}`);
            values.push(validated.data.businessName);
        }
        if (validated.data.fantasyName !== undefined) {
            updates.push(`fantasy_name = $${paramIndex++}`);
            values.push(validated.data.fantasyName);
        }
        if (validated.data.contactEmail !== undefined) {
            updates.push(`contact_email = $${paramIndex++}`);
            values.push(validated.data.contactEmail);
        }
        if (validated.data.phone !== undefined) {
            updates.push(`phone = $${paramIndex++}`);
            values.push(validated.data.phone);
        }
        if (validated.data.address !== undefined) {
            updates.push(`address = $${paramIndex++}`);
            values.push(validated.data.address);
        }

        if (updates.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'No hay cambios para aplicar' };
        }

        updates.push(`updated_at = NOW()`);
        values.push(supplierId);

        await client.query(
            `UPDATE suppliers SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
            values
        );

        await client.query('COMMIT');
        revalidatePath('/proveedores');
        return { success: true };
    } catch (e: any) {
        await client.query('ROLLBACK');
        return { success: false, error: e.message };
    } finally {
        client.release();
    }
}
