'use server';

/**
 * ============================================================================
 * SUPPLIERS-V2: Secure Supplier Management Module
 * Pharma-Synapse v3.2 - Clean Slate Implementation
 * ============================================================================
 * 
 * DESIGN PRINCIPLES:
 * 1. Single Schema Truth: One Zod schema for all UI inputs.
 * 2. Security First: RBAC + session-based user identification.
 * 3. Atomic Integrity: Serializable transactions + Audit logging.
 * 4. UI Resilience: Safe defaults for all retrieval methods.
 */

import { pool } from '@/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { getSessionSecure } from '@/actions/auth-v2';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

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

const BankAccountSchema = z.object({
    bank: z.string().max(100),
    account_type: z.enum(['CORRIENTE', 'VISTA', 'AHORRO']),
    account_number: z.string().max(50),
    email_notification: z.string().email().optional(),
    rut_holder: z.string().max(20).optional(),
}).optional().nullable();

const ContactSchema = z.object({
    name: z.string().max(100),
    email: z.string().email().optional().nullable(),
    phone: z.string().max(20).optional().nullable(),
    role: z.string().max(50).optional().nullable(),
    is_primary: z.boolean().optional().nullable(),
});

/**
 * Single Source of Truth for Supplier Data
 */
const SupplierInputSchema = z.object({
    rut: RUTSchema,
    businessName: z.string().min(2, 'Razón social requerida').max(200),
    fantasyName: z.string().max(200).optional().nullable(),
    contactEmail: z.string().email().optional().nullable(),
    phone1: z.string().max(20).optional().nullable(),
    phone2: z.string().max(20).optional().nullable(),
    address: z.string().max(500).optional().nullable(),
    city: z.string().max(100).optional().nullable(),
    region: z.string().max(100).optional().nullable(),
    commune: z.string().max(100).optional().nullable(),
    website: z.string().max(255).optional().nullable(),
    emailOrders: z.string().email().optional().nullable(),
    emailBilling: z.string().email().optional().nullable(),
    sector: z.string().max(100).optional().nullable(),
    paymentTerms: z.enum(['CONTADO', '30_DIAS', '60_DIAS', '90_DIAS']).optional().default('CONTADO'),
    leadTimeDays: z.number().int().min(1).max(365).optional().default(7),
    bankAccount: BankAccountSchema,
    contacts: z.array(ContactSchema).optional().default([]),
    brands: z.array(z.string().max(100)).optional().default([]),
});

const UpdateSupplierSchema = SupplierInputSchema.partial().extend({
    supplierId: UUIDSchema
});

// ============================================================================
// CONSTANTS & HELPERS
// ============================================================================

const ALLOWED_ROLES = ['ADMIN', 'GERENTE_GENERAL', 'MANAGER', 'QF', 'WAREHOUSE'];

function revalidateSupplierPaths() {
    revalidatePath('/suppliers');
    revalidatePath('/proveedores');
    revalidatePath('/procurement');
}

// ============================================================================
// CORE ACTIONS
// ============================================================================

/**
 * 🏢 Create Supplier
 */
export async function createSupplierSecure(data: z.infer<typeof SupplierInputSchema>): Promise<{
    success: boolean;
    data?: { supplierId: string };
    error?: string;
}> {
    const session = await getSessionSecure();
    if (!session || !ALLOWED_ROLES.includes(session.role)) {
        return { success: false, error: 'Sin permisos (403)' };
    }

    const validated = SupplierInputSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Check uniqueness
        const existing = await client.query('SELECT id FROM suppliers WHERE rut = $1', [validated.data.rut]);
        if (existing.rowCount && existing.rowCount > 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'RUT ya registrado' };
        }

        const supplierId = randomUUID();
        const d = validated.data;

        // Metadata JSONB
        const metadata = {
            bank_account: d.bankAccount || null,
            contacts: d.contacts || [],
            brands: d.brands || [],
            created_by: session.userId,
            created_at: new Date().toISOString()
        };

        // Insert
        await client.query(`
            INSERT INTO suppliers (
                id, rut, business_name, fantasy_name, 
                address, city, region, commune,
                phone_1, phone_2, contact_email, email_orders, email_billing,
                website, sector, payment_terms, lead_time_days,
                metadata, is_active, status, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4,
                $5, $6, $7, $8,
                $9, $10, $11, $12, $13,
                $14, $15, $16, $17,
                $18::jsonb, true, 'ACTIVE', NOW(), NOW()
            )
        `, [
            supplierId, d.rut, d.businessName, d.fantasyName || null,
            d.address || null, d.city || null, d.region || null, d.commune || null,
            d.phone1 || null, d.phone2 || null, d.contactEmail || null, d.emailOrders || null, d.emailBilling || null,
            d.website || null, d.sector || null, d.paymentTerms, d.leadTimeDays,
            JSON.stringify(metadata)
        ]);

        // Audit
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'SUPPLIER_CREATED', 'SUPPLIER', $2, $3::jsonb, NOW())
        `, [session.userId, supplierId, JSON.stringify({ rut: d.rut, business_name: d.businessName })]);

        await client.query('COMMIT');
        revalidateSupplierPaths();
        return { success: true, data: { supplierId } };

    } catch (e: any) {
        await client.query('ROLLBACK');
        console.error('[SUPPLIERS-V2] Create error:', e);
        return { success: false, error: 'Error interno del servidor' };
    } finally {
        client.release();
    }
}

/**
 * ✏️ Update Supplier
 */
export async function updateSupplierSecure(data: z.infer<typeof UpdateSupplierSchema>): Promise<{
    success: boolean;
    error?: string;
}> {
    const session = await getSessionSecure();
    if (!session || !ALLOWED_ROLES.includes(session.role)) {
        return { success: false, error: 'Sin permisos (403)' };
    }

    const validated = UpdateSupplierSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { supplierId, ...updateData } = validated.data;
    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Lock & Fetch
        const existingRes = await client.query('SELECT * FROM suppliers WHERE id = $1 FOR UPDATE', [supplierId]);
        if (existingRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Proveedor no encontrado' };
        }
        const prev = existingRes.rows[0];

        // Dynamic Update
        const updates: string[] = ['updated_at = NOW()'];
        const params: any[] = [];
        let idx = 1;

        const fieldMap: Record<string, string> = {
            businessName: 'business_name',
            fantasyName: 'fantasy_name',
            contactEmail: 'contact_email',
            phone1: 'phone_1',
            phone2: 'phone_2',
            address: 'address',
            city: 'city',
            region: 'region',
            commune: 'commune',
            website: 'website',
            emailOrders: 'email_orders',
            emailBilling: 'email_billing',
            sector: 'sector',
            paymentTerms: 'payment_terms',
            leadTimeDays: 'lead_time_days'
        };

        for (const [jsKey, dbKey] of Object.entries(fieldMap)) {
            const value = (updateData as any)[jsKey];
            if (value !== undefined) {
                updates.push(`${dbKey} = $${idx++}`);
                params.push(value);
            }
        }

        // Metadata Merge
        const existingMetadata = prev.metadata || {};
        const newMetadata = {
            ...existingMetadata,
            ...(updateData.bankAccount !== undefined && { bank_account: updateData.bankAccount }),
            ...(updateData.contacts !== undefined && { contacts: updateData.contacts }),
            ...(updateData.brands !== undefined && { brands: updateData.brands }),
            updated_by: session.userId,
            updated_at: new Date().toISOString()
        };
        updates.push(`metadata = $${idx++}`);
        params.push(JSON.stringify(newMetadata));

        params.push(supplierId);
        await client.query(`UPDATE suppliers SET ${updates.join(', ')} WHERE id = $${idx}`, params);

        // Audit
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, old_values, new_values, created_at)
            VALUES ($1, 'SUPPLIER_UPDATED', 'SUPPLIER', $2, $3::jsonb, $4::jsonb, NOW())
        `, [session.userId, supplierId, JSON.stringify(prev), JSON.stringify(validated.data)]);

        await client.query('COMMIT');
        revalidateSupplierPaths();
        return { success: true };

    } catch (e: any) {
        await client.query('ROLLBACK');
        console.error('[SUPPLIERS-V2] Update error:', e);
        return { success: false, error: 'Error interno del servidor' };
    } finally {
        client.release();
    }
}

/**
 * ❌ Deactivate Supplier
 */
export async function deactivateSupplierSecure(supplierId: string, reason: string): Promise<{
    success: boolean;
    error?: string;
}> {
    const session = await getSessionSecure();
    const ADMIN_LEVEL = ['ADMIN', 'GERENTE_GENERAL', 'MANAGER'];
    if (!session || !ADMIN_LEVEL.includes(session.role)) {
        return { success: false, error: 'Solo nivel gerente puede desactivar (403)' };
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        await client.query(`
            UPDATE suppliers 
            SET is_active = false, status = 'INACTIVE', deactivated_at = NOW(), deactivation_reason = $1 
            WHERE id = $2
        `, [reason, supplierId]);

        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'SUPPLIER_DEACTIVATED', 'SUPPLIER', $2, $3::jsonb, NOW())
        `, [session.userId, supplierId, JSON.stringify({ reason })]);

        await client.query('COMMIT');
        revalidateSupplierPaths();
        return { success: true };
    } catch (e: any) {
        await client.query('ROLLBACK');
        console.error('[SUPPLIERS-V2] Deactivate error:', e);
        return { success: false, error: 'Error interno' };
    } finally {
        client.release();
    }
}

/**
 * 📋 Get Suppliers List
 */
export async function getSuppliersListSecure() {
    try {
        const res = await pool.query(`
            SELECT 
                *,
                COALESCE(NULLIF(fantasy_name,''), business_name) as name
            FROM suppliers 
            WHERE is_active = true 
            ORDER BY name ASC
        `);

        return {
            success: true,
            data: res.rows.map(s => ({
                ...s,
                bankAccount: s.metadata?.bank_account || null,
                contacts: s.metadata?.contacts || [],
                brands: s.metadata?.brands || [],
                paymentTerms: s.payment_terms || 'CONTADO',
                leadTimeDays: s.lead_time_days || 7
            }))
        };
    } catch (e: any) {
        console.error('[SUPPLIERS-V2] List error:', e);
        return { success: false, error: 'Error al obtener lista' };
    }
}

/**
 * 🔍 Get Single Supplier
 */
export async function getSupplierSecure(supplierId: string) {
    try {
        const res = await pool.query('SELECT * FROM suppliers WHERE id = $1', [supplierId]);
        if (res.rowCount === 0) return { success: false, error: 'No encontrado' };

        const s = res.rows[0];
        return {
            success: true,
            data: {
                ...s,
                bankAccount: s.metadata?.bank_account || null,
                contacts: s.metadata?.contacts || [],
                brands: s.metadata?.brands || [],
                paymentTerms: s.payment_terms || 'CONTADO',
                leadTimeDays: s.lead_time_days || 7
            }
        };
    } catch (e: any) {
        console.error('[SUPPLIERS-V2] Get error:', e);
        return { success: false, error: 'Error al obtener detalle' };
    }
}
