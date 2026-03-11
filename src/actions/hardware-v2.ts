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

import { pool, query, type PoolClient } from '@/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import bcrypt from 'bcryptjs';

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
// CONSTANTS
// ============================================================================

const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'];

// ============================================================================
// HELPERS
// ============================================================================

async function getSession(): Promise<{ userId: string; role: string; locationId?: string } | null> {
    try {
        const headersList = await headers();
        const userId = headersList.get('x-user-id');
        const role = headersList.get('x-user-role');
        const locationId = headersList.get('x-user-location');
        if (!userId || !role) return null;
        return { userId, role, locationId: locationId || undefined };
    } catch {
        return null;
    }
}

async function validateManagerPin(
    client: PoolClient,
    pin: string
): Promise<{ valid: boolean; manager?: { id: string; name: string } }> {
    try {
        const { checkRateLimit, recordFailedAttempt, resetAttempts } = await import('@/lib/rate-limiter');

        const managersRes = await client.query(`
            SELECT id, name, access_pin_hash, access_pin
            FROM users WHERE role = ANY($1::text[]) AND is_active = true
        `, [MANAGER_ROLES]);

        for (const user of managersRes.rows) {
            const rateCheck = checkRateLimit(user.id);
            if (!rateCheck.allowed) continue;

            if (user.access_pin_hash) {
                const valid = await bcrypt.compare(pin, user.access_pin_hash);
                if (valid) {
                    resetAttempts(user.id);
                    return { valid: true, manager: { id: user.id, name: user.name } };
                }
                recordFailedAttempt(user.id);
            } else if (user.access_pin === pin) {
                resetAttempts(user.id);
                return { valid: true, manager: { id: user.id, name: user.name } };
            }
        }
        return { valid: false };
    } catch {
        return { valid: false };
    }
}

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

    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    try {
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
        if (!MANAGER_ROLES.includes(session.role) && session.locationId !== terminal.location_id) {
            return { success: false, error: 'No tienes acceso a este terminal' };
        }

        return { success: true, config: terminal.config || {} };

    } catch (error: unknown) {
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

    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Validar PIN MANAGER
        const authResult = await validateManagerPin(client, managerPin);
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
            UPDATE terminals SET config = $2, updated_at = NOW()
            WHERE id = $1
        `, [terminalId, validatedConfig.data]);

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, old_values, new_values, created_at)
            VALUES ($1, 'HARDWARE_CONFIG_UPDATED', 'TERMINAL', $2, $3::jsonb, $4::jsonb, NOW())
        `, [authResult.manager!.id, terminalId, JSON.stringify(prevConfig), JSON.stringify(validatedConfig.data)]);

        await client.query('COMMIT');

        logger.info({ terminalId }, '⚙️ [Hardware] Config updated');
        revalidatePath('/caja');
        return { success: true };

    } catch (error: unknown) {
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

    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    try {
        // En un entorno real, aquí se haría la conexión real
        // Por ahora, simulamos un test exitoso
        logger.info({ terminalId, printerId }, '🧪 [Hardware] Printer test requested');

        // Simular delay de conexión
        await new Promise(resolve => setTimeout(resolve, 500));

        return { success: true, connected: true };

    } catch (error: unknown) {
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

    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

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

    } catch (error: unknown) {
        logger.error({ error }, '[Hardware] Get printers error');
        return { success: false, error: 'Error obteniendo impresoras' };
    }
}
