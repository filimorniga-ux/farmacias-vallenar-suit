'use server';

import { logAction as logToDb } from '@/lib/logger';

export async function logActionServer(usuario: string, accion: string, detalle: string) {
    await logToDb(usuario, accion, detalle);
}
