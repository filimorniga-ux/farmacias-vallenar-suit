'use server';

import { query } from '@/lib/db';
import { Supplier } from '@/domain/types';
import { revalidatePath } from 'next/cache';

export async function createSupplier(supplier: Omit<Supplier, 'id'>) {
    try {
        const { v4: uuidv4 } = await import('uuid');
        const id = uuidv4();

        const sql = `
            INSERT INTO suppliers (
                id, rut, business_name, fantasy_name, contact_email, 
                payment_terms, address, region, city, commune, 
                phone, email_orders, email_billing, sector,
                bank_name, account_number, account_type, rut_holder, email_notification, contact_name,
                brands, lead_time_days
            ) VALUES (
                $1, $2, $3, $4, $5, 
                $6, $7, $8, $9, $10,
                $11, $12, $13, $14,
                $15, $16, $17, $18, $19, $20,
                $21, $22
            )
        `;

        const values = [
            id,
            supplier.rut,
            supplier.business_name,
            supplier.fantasy_name,
            supplier.contact_email,
            supplier.payment_terms,
            supplier.address,
            supplier.region,
            supplier.city,
            supplier.commune,
            supplier.phone_1, // Mapping phone_1 to phone column
            supplier.email_orders,
            supplier.email_billing,
            supplier.sector || 'LABORATORIO',
            // Bank Details
            supplier.bank_account?.bank || null,
            supplier.bank_account?.account_number || null,
            supplier.bank_account?.account_type || null,
            supplier.bank_account?.rut_holder || null,
            supplier.bank_account?.email_notification || null,
            supplier.contacts?.[0]?.name || null, // First contact name
            // Extras
            JSON.stringify(supplier.brands || []),
            supplier.lead_time_days || 7
        ];

        await query(sql, values);

        revalidatePath('/proveedores');
        return { success: true, id };
    } catch (error) {
        console.error('Error creating supplier:', error);
        return { success: false, error: 'Database error' };
    }
}

export async function updateSupplier(id: string, data: Partial<Supplier>) {
    try {
        // Build dynamic update query
        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        // Helper to add field
        const add = (col: string, val: any) => {
            if (val !== undefined) {
                fields.push(`${col} = $${idx++} `);
                values.push(val);
            }
        };

        add('business_name', data.business_name);
        add('fantasy_name', data.fantasy_name);
        add('rut', data.rut);
        add('contact_email', data.contact_email);
        add('payment_terms', data.payment_terms);
        add('address', data.address);
        add('region', data.region);
        add('city', data.city);
        add('commune', data.commune);
        add('phone', data.phone_1); // Map phone_1 -> phone
        add('email_orders', data.email_orders);
        add('email_billing', data.email_billing);
        add('sector', data.sector);
        add('lead_time_days', data.lead_time_days);

        // Contacts (Update first contact name if provided)
        if (data.contacts && data.contacts.length > 0) {
            add('contact_name', data.contacts[0].name);
        }

        // Bank
        if (data.bank_account) {
            add('bank_name', data.bank_account.bank);
            add('account_number', data.bank_account.account_number);
            add('account_type', data.bank_account.account_type);
            add('rut_holder', data.bank_account.rut_holder);
            add('email_notification', data.bank_account.email_notification);
        }

        if (fields.length === 0) return { success: true }; // Nothing to update

        const sql = `UPDATE suppliers SET ${fields.join(', ')} WHERE id = $${idx} `;
        values.push(id);

        await query(sql, values);

        revalidatePath('/proveedores');
        return { success: true };
    } catch (error) {
        console.error('Error updating supplier:', error);
        return { success: false, error: 'Update failed' };
    }
}
