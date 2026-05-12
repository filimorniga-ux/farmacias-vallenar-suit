'use server';

import { pool } from '@/lib/db';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { getValidatedSession } from '@/lib/server-session';

const NoteSchema = z.object({
    content: z.string().trim().min(1, 'El contenido no puede estar vacío').max(500, 'Máximo 500 caracteres'),
    branch: z.string().trim().max(120, 'Máximo 120 caracteres').optional(),
});

const DeleteNoteSchema = z.string().uuid('Nota inválida');
const BOARD_DELETE_ROLES = new Set(['ADMIN', 'MANAGER', 'GERENTE_GENERAL']);

function normalizeRole(role: string | null | undefined) {
    return String(role || '').trim().toUpperCase();
}

export async function postNote(data: z.infer<typeof NoteSchema>) {
    const validated = NoteSchema.safeParse(data);
    if (!validated.success) return { success: false, error: validated.error.issues[0]?.message };

    const session = await getValidatedSession();
    if (!session) {
        return { success: false, error: 'Sesión no válida. Vuelve a iniciar sesión.' };
    }

    const client = await pool.connect();
    try {
        await client.query(
            `INSERT INTO board_notes (id, content, author_name, author_role, branch, created_by, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [
                randomUUID(),
                validated.data.content,
                session.userName,
                normalizeRole(session.role) || 'USUARIO',
                validated.data.branch || 'General',
                session.userId,
            ]
        );

        return { success: true };
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Error desconocido';
        return { success: false, error };
    } finally {
        client.release();
    }
}

export async function getNotes() {
    const session = await getValidatedSession();
    if (!session) {
        return { success: false, error: 'Sesión no válida. Vuelve a iniciar sesión.' };
    }

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

export async function deleteNote(id: string, _legacyUserId?: string) {
    const validated = DeleteNoteSchema.safeParse(id);
    if (!validated.success) return { success: false, error: validated.error.issues[0]?.message };

    const session = await getValidatedSession();
    if (!session) {
        return { success: false, error: 'Sesión no válida. Vuelve a iniciar sesión.' };
    }

    if (!BOARD_DELETE_ROLES.has(normalizeRole(session.role))) {
        return { success: false, error: 'No tienes permisos para eliminar notas' };
    }

    const client = await pool.connect();
    try {
        await client.query('DELETE FROM board_notes WHERE id = $1', [validated.data]);
        return { success: true };
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Error desconocido';
        return { success: false, error };
    } finally {
        client.release();
    }
}
