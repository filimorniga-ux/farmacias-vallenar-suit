'use server';

import { query } from '../lib/db';
import { revalidatePath } from 'next/cache';
import { v4 as uuidv4 } from 'uuid';

export interface FinancialAccount {
    id: string;
    location_id: string | null;
    name: string;
    type: 'SAFE' | 'BANK' | 'PETTY_CASH' | 'EQUITY';
    balance: number;
    is_active: boolean;
    created_at: Date;
}

export async function getFinancialAccounts() {
    try {
        const res = await query(`
            SELECT 
                fa.*, 
                l.name as location_name 
            FROM financial_accounts fa
            LEFT JOIN locations l ON fa.location_id = l.id
            ORDER BY fa.created_at DESC
        `);
        return { success: true, data: res.rows };
    } catch (error) {
        console.error('Error fetching accounts:', error);
        return { success: false, error: 'Error al cargar cuentas' };
    }
}

export async function createFinancialAccount(data: { name: string; type: string; location_id?: string | null }) {
    try {
        const id = uuidv4();
        await query(
            `INSERT INTO financial_accounts (id, name, type, location_id, balance, is_active) 
             VALUES ($1, $2, $3, $4, 0, true)`,
            [id, data.name, data.type, data.location_id || null]
        );
        revalidatePath('/settings');
        return { success: true, data: { id } };
    } catch (error) {
        console.error('Error creating account:', error);
        return { success: false, error: 'Error al crear cuenta' };
    }
}

export async function updateFinancialAccount(id: string, data: { name: string; location_id?: string | null }) {
    try {
        await query(
            `UPDATE financial_accounts SET name = $1, location_id = $2, updated_at = NOW() WHERE id = $3`,
            [data.name, data.location_id || null, id]
        );
        revalidatePath('/settings');
        return { success: true };
    } catch (error) {
        console.error('Error updating account:', error);
        return { success: false, error: 'Error al actualizar cuenta' };
    }
}

export async function toggleAccountStatus(id: string, requestStatus: boolean) {
    try {
        await query(
            `UPDATE financial_accounts SET is_active = $1, updated_at = NOW() WHERE id = $2`,
            [requestStatus, id]
        );
        revalidatePath('/settings');
        return { success: true };
    } catch (error) {
        console.error('Error toggling status:', error);
        return { success: false, error: 'Error al cambiar estado' };
    }
}
