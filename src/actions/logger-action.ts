'use server';

import { logger } from '@/lib/logger';

export async function logActionServer(usuario: string, accion: string, detalle: string) {
    logger.info({ usuario, accion, detalle }, 'User Action Logged');
}
