'use server';

/**
 * ============================================================================
 * HARDWARE-V2: Configuración de Hardware Segura
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES:
 * - RBAC para acceso a configuración
 * - PIN MANAGER para cambios
 * - Schema Zod para HardwareConfig
 * - Auditoría de cambios
 */

import { pool, query } from '@/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger';
import { resolveActorResult } from './actor-result';
import {
    ROLE_GROUPS,
    validatePinForRoles,
} from '@/lib/pin-rbac';

// ============================================================================
// SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');

const HardwareConfigSchema = z.object({
    receipt_printer: z.string().optional(),
    label_printer: z.string().optional(),
    auto_print_receipt: z.boolean().optional(),
    scale_port: z.string().optional(),
    scanner_mode: z.enum(['KEYBOARD', 'SERIAL']).optional(),
});

// ============================================================================
// GET HARDWARE CONFIG
// ============================================================================

/**
 * 🖨️ Obtener Configuración de Hardware (con RBAC)
 */
export async function getTerminalHardwareConfigSecure(
    terminalId: string
): Promise<{ success: boolean; config?: z.infer<typeof HardwareConfigSchema>; error?: string }> {
    if (!UUIDSchema.safeParse(terminalId).success) {
        return { success: false, error: 'ID de terminal inválido' };
    }

    const auth = await resolveActorResult();
    if (!auth.success) {
        return { success: false, error: auth.error };
    }

    try {
        const actor = auth.actor;
        // Verificar que el usuario tiene acceso al terminal
        const termRes = await query(`
            SELECT t.config, t.location_id 
            FROM terminals t 
            WHERE t.id = $1
        `, [terminalId]);

        if (termRes.rowCount === 0) {
            return { success: false, error: 'Terminal no encontrado' };
        }

        const terminal = termRes.rows[0];

        // RBAC: Usuario debe tener acceso a la ubicación
        if (!ROLE_GROUPS.MANAGER.includes(actor.role as typeof ROLE_GROUPS.MANAGER[number]) && actor.locationId !== terminal.location_id) {
            return { success: false, error: 'No tienes acceso a este terminal' };
        }

        return { success: true, config: terminal.config || {} };

    } catch (error: any) {
        logger.error({ error }, '[Hardware] Get config error');
        return { success: false, error: 'Error obteniendo configuración' };
    }
}

// ============================================================================
// UPDATE HARDWARE CONFIG
// ============================================================================

/**
 * ⚙️ Actualizar Configuración de Hardware (PIN MANAGER)
 */
export async function updateTerminalHardwareConfigSecure(
    terminalId: string,
    config: z.infer<typeof HardwareConfigSchema>,
    managerPin: string
): Promise<{ success: boolean; error?: string }> {
    if (!UUIDSchema.safeParse(terminalId).success) {
        return { success: false, error: 'ID de terminal inválido' };
    }

    const validatedConfig = HardwareConfigSchema.safeParse(config);
    if (!validatedConfig.success) {
        return { success: false, error: validatedConfig.error.issues[0]?.message };
    }

    const auth = await resolveActorResult();
    if (!auth.success) {
        return { success: false, error: auth.error };
    }
    const actor = auth.actor;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Validar PIN MANAGER
        const authResult = await validatePinForRoles(client, managerPin, ROLE_GROUPS.MANAGER, {
            allowLegacyPlaintext: true,
            useRateLimiter: true,
        });
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: 'PIN de manager inválido' };
        }

        // Obtener config anterior
        const prevRes = await client.query('SELECT config FROM terminals WHERE id = $1', [terminalId]);
        if (prevRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Terminal no encontrado' };
        }
        const prevConfig = prevRes.rows[0].config || {};

        // Actualizar
        await client.query(`
            UPDATE terminals SET config = $2
            WHERE id = $1
        `, [terminalId, validatedConfig.data]);

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, old_values, new_values, created_at)
            VALUES ($1, 'HARDWARE_CONFIG_UPDATED', 'TERMINAL', $2, $3::jsonb, $4::jsonb, NOW())
        `, [actor.userId, terminalId, JSON.stringify(prevConfig), JSON.stringify(validatedConfig.data)]);

        await client.query('COMMIT');

        logger.info({
            terminalId,
            actorUserId: actor.userId,
            authorizedById: authResult.authorizedBy.id,
        }, '⚙️ [Hardware] Config updated');
        revalidatePath('/caja');
        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Hardware] Update config error');
        return { success: false, error: 'Error actualizando configuración' };
    } finally {
        client.release();
    }
}

// ============================================================================
// TEST PRINTER CONNECTION
// ============================================================================

/**
 * 🧪 Test Conexión de Impresora
 */
export async function testPrinterConnectionSecure(
    terminalId: string,
    printerId: string
): Promise<{ success: boolean; connected?: boolean; error?: string }> {
    if (!UUIDSchema.safeParse(terminalId).success) {
        return { success: false, error: 'ID de terminal inválido' };
    }

    const auth = await resolveActorResult();
    if (!auth.success) {
        return { success: false, error: auth.error };
    }
    const actor = auth.actor;

    try {
        // En un entorno real, aquí se haría la conexión real
        // Por ahora, simulamos un test exitoso
        logger.info({ terminalId, printerId }, '🧪 [Hardware] Printer test requested');

        // Simular delay de conexión
        await new Promise(resolve => setTimeout(resolve, 500));

        return { success: true, connected: true };

    } catch (error: any) {
        logger.error({ error }, '[Hardware] Test printer error');
        return { success: false, error: 'Error testeando impresora' };
    }
}

// ============================================================================
// GET AVAILABLE PRINTERS
// ============================================================================

/**
 * 🖨️ Obtener Impresoras Disponibles
 */
export async function getAvailablePrintersSecure(
    terminalId: string
): Promise<{ success: boolean; printers?: string[]; error?: string }> {
    if (!UUIDSchema.safeParse(terminalId).success) {
        return { success: false, error: 'ID de terminal inválido' };
    }

    const auth = await resolveActorResult();
    if (!auth.success) {
        return { success: false, error: auth.error };
    }
    const actor = auth.actor;

    try {
        // En un entorno real, se detectarían impresoras del sistema
        // Por ahora, retornamos lista estática de ejemplo
        const printers = [
            'EPSON TM-T20III',
            'STAR TSP143II',
            'BIXOLON SRP-350III',
            'ZEBRA ZD410',
        ];

        return { success: true, printers };

    } catch (error: any) {
        logger.error({ error }, '[Hardware] Get printers error');
        return { success: false, error: 'Error obteniendo impresoras' };
    }
}
