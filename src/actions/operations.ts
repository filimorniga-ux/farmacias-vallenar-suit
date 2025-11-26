'use server';

import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';

// --- Shift Management ---

export async function getShiftStatus() {
    try {
        const sql = `SELECT valor FROM configuracion_global WHERE clave = 'en_turno'`;
        const res = await query(sql);
        return res.rows.length > 0 ? res.rows[0].valor === 'true' : false;
    } catch (error) {
        console.error('Error getting shift status:', error);
        return false;
    }
}

export async function toggleShift(isOpen: boolean) {
    try {
        const sql = `
            INSERT INTO configuracion_global (clave, valor) 
            VALUES ('en_turno', $1) 
            ON CONFLICT (clave) 
            DO UPDATE SET valor = $1, updated_at = CURRENT_TIMESTAMP
        `;
        await query(sql, [String(isOpen)]);
        revalidatePath('/');
        return { success: true };
    } catch (error) {
        console.error('Error toggling shift:', error);
        return { success: false, error: 'Failed to update shift status' };
    }
}

// --- Time Clock (Asistencia) ---

export async function clockIn(userId: number) {
    try {
        // Check if already clocked in today without clock out
        const checkSql = `
            SELECT id FROM asistencia 
            WHERE usuario_id = $1 AND fecha = CURRENT_DATE AND hora_salida IS NULL
        `;
        const checkRes = await query(checkSql, [userId]);

        if (checkRes.rows.length > 0) {
            return { success: false, error: 'Ya has marcado entrada hoy.' };
        }

        const sql = `
            INSERT INTO asistencia (usuario_id, fecha, hora_entrada, estado)
            VALUES ($1, CURRENT_DATE, CURRENT_TIME, 'presente')
        `;
        await query(sql, [userId]);
        revalidatePath('/');
        return { success: true };
    } catch (error) {
        console.error('Error clocking in:', error);
        return { success: false, error: 'Error al marcar entrada' };
    }
}

export async function clockOut(userId: number) {
    try {
        const sql = `
            UPDATE asistencia 
            SET hora_salida = CURRENT_TIME, estado = 'finalizado'
            WHERE usuario_id = $1 AND fecha = CURRENT_DATE AND hora_salida IS NULL
        `;
        const res = await query(sql, [userId]);

        if (res.rowCount === 0) {
            return { success: false, error: 'No tienes una entrada activa para marcar salida.' };
        }

        revalidatePath('/');
        return { success: true };
    } catch (error) {
        console.error('Error clocking out:', error);
        return { success: false, error: 'Error al marcar salida' };
    }
}

// --- Queue System (Totem) ---

export async function generateTicket(type: 'GENERAL' | 'PREFERENCIAL' | 'CAJA') {
    try {
        // 1. Get current number for today
        const countSql = `SELECT COUNT(*) as count FROM cola_atencion WHERE DATE(created_at) = CURRENT_DATE`;
        const countRes = await query(countSql);
        const nextNum = parseInt(countRes.rows[0].count || '0') + 1;

        const prefix = type === 'PREFERENCIAL' ? 'P' : type === 'CAJA' ? 'C' : 'A';
        const ticketNumber = `${prefix}-${nextNum.toString().padStart(3, '0')}`;

        // 2. Insert ticket
        const insertSql = `
            INSERT INTO cola_atencion (numero_ticket, tipo, estado)
            VALUES ($1, $2, 'espera')
            RETURNING id, numero_ticket, created_at
        `;
        const res = await query(insertSql, [ticketNumber, type]);

        revalidatePath('/totem');
        return { success: true, ticket: res.rows[0] };
    } catch (error) {
        console.error('Error generating ticket:', error);
        return { success: false, error: 'Error al generar ticket' };
    }
}

export async function getNextTicket(counterId: number) {
    try {
        // Find oldest ticket in 'espera'
        const findSql = `
            SELECT id, numero_ticket FROM cola_atencion 
            WHERE estado = 'espera' 
            ORDER BY created_at ASC 
            LIMIT 1
        `;
        const findRes = await query(findSql);

        if (findRes.rows.length === 0) {
            return { success: false, message: 'No hay clientes en espera' };
        }

        const ticket = findRes.rows[0];

        // Update ticket to 'llamando' or 'atendiendo'
        const updateSql = `
            UPDATE cola_atencion 
            SET estado = 'llamando', modulo_atencion = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
        `;
        await query(updateSql, [counterId, ticket.id]);

        revalidatePath('/');
        return { success: true, ticket };
    } catch (error) {
        console.error('Error calling next ticket:', error);
        return { success: false, error: 'Error al llamar siguiente número' };
    }
}
