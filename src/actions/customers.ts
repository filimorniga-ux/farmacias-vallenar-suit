'use server';

import { query } from '@/lib/db';
import { Customer } from '@/domain/types';
import { revalidatePath } from 'next/cache';

export async function getCustomers(limit = 1000): Promise<Customer[]> {
    try {
        const sql = `
            SELECT * FROM customers 
            WHERE status != 'DELETED'
            ORDER BY name ASC
            LIMIT $1
        `;
        const res = await query(sql, [limit]);

        return res.rows.map(row => ({
            id: row.id,
            rut: row.rut,
            fullName: row.name,
            name: row.name, // Alias
            phone: row.phone,
            email: row.email,
            // address: row.address, // Not in type
            tags: row.tags || [],
            totalPoints: row.loyalty_points || 0,
            lastVisit: row.last_visit ? new Date(row.last_visit).getTime() : Date.now(), // Number
            status: row.status,
            health_tags: row.health_tags || [],
            // notes: row.notes, // Not in type
            total_spent: 0,
            age: 0, // Default
            registrationSource: 'ADMIN'
        }));
    } catch (error) {
        console.error('Error fetching customers:', error);
        return [];
    }
}

export async function createCustomer(data: Partial<Customer>): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
        const id = crypto.randomUUID();
        const sql = `
            INSERT INTO customers (
                id, rut, name, phone, email, address, 
                tags, loyalty_points, status, health_tags, notes, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, 
                $7, $8, $9, $10, $11, NOW(), NOW()
            ) RETURNING id
        `;

        const input = data as any;

        await query(sql, [
            id,
            input.rut,
            input.fullName,
            input.phone,
            input.email,
            input.address, // stored in DB even if not in UI Type
            JSON.stringify(input.tags || []),
            input.totalPoints || 0,
            'ACTIVE',
            JSON.stringify(input.health_tags || []),
            input.notes
        ]);

        revalidatePath('/clientes');
        return { success: true, id };
    } catch (error) {
        console.error('Error creating customer:', error);
        return { success: false, error: 'Error al crear cliente' };
    }
}

export async function updateCustomer(id: string, data: Partial<Customer>): Promise<{ success: boolean; error?: string }> {
    try {
        const sql = `
            UPDATE customers 
            SET 
                rut = COALESCE($2, rut),
                name = COALESCE($3, name),
                phone = COALESCE($4, phone),
                email = COALESCE($5, email),
                address = COALESCE($6, address),
                tags = COALESCE($7, tags),
                health_tags = COALESCE($8, health_tags),
                notes = COALESCE($9, notes),
                updated_at = NOW()
            WHERE id = $1
        `;

        const input = data as any;

        await query(sql, [
            id,
            input.rut,
            input.fullName,
            input.phone,
            input.email,
            input.address,
            input.tags ? JSON.stringify(input.tags) : null,
            input.health_tags ? JSON.stringify(input.health_tags) : null,
            input.notes
        ]);

        revalidatePath('/clientes');
        return { success: true };
    } catch (error) {
        console.error('Error updating customer:', error);
        return { success: false, error: 'Error al actualizar cliente' };
    }
}
