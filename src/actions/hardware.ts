'use server';

import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export interface HardwareConfig {
    receipt_printer?: string;
    label_printer?: string;
    auto_print_receipt?: boolean;
    scale_port?: string;
    scanner_mode?: 'KEYBOARD' | 'SERIAL';
}

export async function getTerminalHardwareConfig(terminalId: string): Promise<HardwareConfig> {
    try {
        const res = await query('SELECT config FROM terminals WHERE id = $1', [terminalId]);

        if (res.rows.length === 0) return {};
        return res.rows[0].config || {};
    } catch (error) {
        console.error('Error fetching hardware config:', error);
        return {};
    }
}

export async function updateTerminalHardwareConfig(terminalId: string, config: HardwareConfig) {
    try {
        await query('UPDATE terminals SET config = $2 WHERE id = $1', [terminalId, config]);
        revalidatePath('/caja'); // Revalidate POS page
        return { success: true };
    } catch (error) {
        console.error('Error updating hardware config:', error);
        return { success: false, error: 'Failed to update config' };
    }
}
