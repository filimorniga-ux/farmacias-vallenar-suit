'use server';

import { pool } from '@/lib/db';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const NoteSchema = z.object({
    content: z.string().min(1, 'El contenido no puede estar vacío').max(500, 'Máximo 500 caracteres'),
    userId: z.string().uuid(),
    authorName: z.string(),
    authorRole: z.string().optional(),
    branch: z.string().optional(),
});

export async function postNote(data: z.infer<typeof NoteSchema>) {
    const validated = NoteSchema.safeParse(data);
    if (!validated.success) return { success: false, error: validated.error.issues[0]?.message };

    const client = await pool.connect();
    try {
        await client.query(
            `INSERT INTO board_notes (id, content, author_name, author_role, branch, created_by, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [
                randomUUID(),
                validated.data.content,
                validated.data.authorName,
                validated.data.authorRole || 'Usuario',
                validated.data.branch || 'General',
                validated.data.userId,
            ]
        );

        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    } finally {
        client.release();
    }
}

export async function getNotes() {
    try {
        const res = await pool.query(
            `SELECT * FROM board_notes ORDER BY created_at DESC LIMIT 50`
        );
        return { success: true, data: res.rows };
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Error desconocido';
        return { success: false, error };
    }
}

export async function deleteNote(id: string, userId: string) {
    // Basic verification: Only admins/managers should typically use this, 
    // but the UI will hide the button. Stronger RBAC can be added if needed,
    // like checking the user's role against the DB here.

    // For now, we trust the UI context or add a quick DB check if strict strictness is required.
    // Let's do a quick role check for safety.

    const client = await pool.connect();
    try {
        const userRes = await client.query('SELECT role FROM users WHERE id = $1', [userId]);
        const role = userRes.rows[0]?.role;

        if (role !== 'ADMIN' && role !== 'MANAGER' && role !== 'GERENTE_GENERAL') {
            return { success: false, error: 'No tienes permisos para eliminar notas' };
        }

        await client.query('DELETE FROM board_notes WHERE id = $1', [id]);
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    } finally {
        client.release();
    }
}
