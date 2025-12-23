'use server';

/**
 * 🚀 TERMINALS V2 - ATOMIC OPERATIONS
 * Pharma-Synapse v3.1 - Farmacias Vallenar
 * 
 * Este módulo implementa operaciones atómicas para terminales POS con:
 * - Transacciones SERIALIZABLE
 * - Bloqueo pesimista (FOR UPDATE NOWAIT)
 * - Integración con sistema de auditoría
 * - Manejo robusto de errores
 * 
 * @version 2.1.0
 * @date 2024-12-23
 */

import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logger } from '@/lib/logger';

// =====================================================
// SCHEMAS DE VALIDACIÓN
// =====================================================

const OpenTerminalSchema = z.object({
    terminalId: z.string().uuid({ message: "ID de terminal inválido" }),
    userId: z.string().min(1, { message: "ID de usuario requerido" }),
    initialCash: z.number().min(0, { message: "El fondo inicial no puede ser negativo" })
});

const CloseTerminalSchema = z.object({
    terminalId: z.string().uuid(),
    userId: z.string().min(1),
    finalCash: z.number().min(0),
    withdrawalAmount: z.number().min(0),
    comments: z.string().optional()
});

const ForceCloseSchema = z.object({
    terminalId: z.string().uuid({ message: "ID de terminal inválido" }),
    adminUserId: z.string().min(1, { message: "ID de administrador requerido" }),
    justification: z.string().min(10, { message: "Justificación requerida (mínimo 10 caracteres)" })
});

// =====================================================
// CONSTANTES DE ERRORES
// =====================================================

const ERROR_CODES = {
    LOCK_NOT_AVAILABLE: '55P03',
    SERIALIZATION_FAILURE: '40001',
    DEADLOCK_DETECTED: '40P01'
} as const;

const ERROR_MESSAGES = {
    TERMINAL_LOCKED: 'Terminal ocupado por otro proceso. Intente en unos segundos.',
    TERMINAL_NOT_FOUND: 'Terminal no encontrada',
    TERMINAL_OCCUPIED: 'Terminal ocupado por otro usuario',
    SESSION_NOT_FOUND: 'No hay sesión activa para este usuario',
    SERIALIZATION_ERROR: 'Conflicto de concurrencia. Por favor reintente.',
    DEADLOCK: 'Se detectó un bloqueo. Reintentando...'
} as const;

// =====================================================
// HELPER: Insertar Auditoría
// =====================================================

async function insertAuditLog(
    client: any,
    params: {
        userId: string;
        terminalId: string;
        sessionId?: string;
        locationId?: string;
        actionCode: string;
        entityType: string;
        entityId: string;
        oldValues?: Record<string, any>;
        newValues?: Record<string, any>;
        justification?: string;
    }
) {
    try {
        await client.query(`
            INSERT INTO audit_log (
                user_id, terminal_id, session_id, location_id,
                action_code, entity_type, entity_id,
                old_values, new_values, justification
            ) VALUES (
                $1::uuid, $2::uuid, $3::uuid, $4::uuid,
                $5, $6, $7,
                $8::jsonb, $9::jsonb, $10
            )
        `, [
            params.userId || null,
            params.terminalId || null,
            params.sessionId || null,
            params.locationId || null,
            params.actionCode,
            params.entityType,
            params.entityId,
            params.oldValues ? JSON.stringify(params.oldValues) : null,
            params.newValues ? JSON.stringify(params.newValues) : null,
            params.justification || null
        ]);
    } catch (auditError: any) {
        // Log pero no fallar la transacción principal si audit_log no existe aún
        logger.warn({ err: auditError }, 'Audit log insertion failed (non-critical if table missing)');
    }
}

// =====================================================
// FUNCIÓN: ABRIR TERMINAL (ATÓMICA)
// =====================================================

/**
 * Abre un terminal de forma atómica con bloqueo pesimista.
 * 
 * @param terminalId - UUID del terminal
 * @param userId - ID del usuario/cajero
 * @param initialCash - Monto inicial de apertura
 * @returns Resultado con sessionId o error
 * 
 * @example
 * const result = await openTerminalAtomic('uuid-terminal', 'uuid-user', 50000);
 * if (result.success) {
 *   console.log('Sesión:', result.sessionId);
 * }
 */
export async function openTerminalAtomic(
    terminalId: string, 
    userId: string, 
    initialCash: number
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    
    // 1. Validación rápida (fail-fast)
    const validation = OpenTerminalSchema.safeParse({ terminalId, userId, initialCash });
    if (!validation.success) {
        logger.warn({ error: validation.error.format(), userId, terminalId }, 'Invalid input for openTerminalAtomic');
        return { success: false, error: validation.error.issues[0]?.message || 'Datos inválidos' };
    }

    const { pool } = await import('@/lib/db');
    const client = await pool.connect();

    try {
        logger.info({ terminalId, userId, initialCash }, '🔐 [Atomic v2.1] Starting transaction: Open Terminal');

        // --- INICIO DE TRANSACCIÓN ---
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 2. Check Idempotency (si ya tiene sesión activa, retornarla)
        const existingSession = await client.query(`
            SELECT id FROM cash_register_sessions 
            WHERE terminal_id = $1 AND user_id = $2 AND closed_at IS NULL
        `, [terminalId, userId]);

        if (existingSession.rows.length > 0) {
            await client.query('COMMIT');
            logger.info({ sessionId: existingSession.rows[0].id }, '✅ [Atomic v2.1] Session already exists. Returning existing ID.');
            return { success: true, sessionId: existingSession.rows[0].id };
        }

        // 3. BLOQUEO PESIMISTA con NOWAIT (fail-fast si está bloqueado)
        const termCheck = await client.query(`
            SELECT id, status, current_cashier_id, location_id, name 
            FROM terminals 
            WHERE id = $1 
            FOR UPDATE NOWAIT
        `, [terminalId]);

        if (termCheck.rows.length === 0) {
            throw new Error(ERROR_MESSAGES.TERMINAL_NOT_FOUND);
        }

        const terminal = termCheck.rows[0];

        // 4. Verificar disponibilidad
        if (terminal.status === 'OPEN' && terminal.current_cashier_id !== userId) {
            throw new Error(ERROR_MESSAGES.TERMINAL_OCCUPIED);
        }

        // 5. Auto-cleanup de sesiones ghost del usuario
        const ghostCleanup = await client.query(`
            UPDATE cash_register_sessions 
            SET closed_at = NOW(), 
                status = 'CLOSED_AUTO', 
                notes = 'Auto-cerrada por nueva apertura en otro terminal'
            WHERE user_id = $1 AND closed_at IS NULL
            RETURNING id
        `, [userId]);

        if (ghostCleanup.rowCount > 0) {
            logger.info({ closedSessions: ghostCleanup.rowCount }, '🧹 [Atomic v2.1] Cleaned ghost sessions');
        }

        // 6. Generar UUIDs
        const { v4: uuidv4 } = await import('uuid');
        const newSessionId = uuidv4();
        const moveId = uuidv4();

        // 7. OPERACIONES ATÓMICAS

        // A. Insertar movimiento de caja (apertura)
        await client.query(`
            INSERT INTO cash_movements (
                id, location_id, terminal_id, session_id, user_id, 
                type, amount, reason, timestamp
            ) VALUES (
                $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
                'APERTURA', $6, 'Apertura de Caja', NOW()
            )
        `, [moveId, terminal.location_id, terminalId, newSessionId, userId, initialCash]);

        // B. Actualizar estado del terminal
        await client.query(`
            UPDATE terminals 
            SET status = 'OPEN', 
                current_cashier_id = $2::uuid, 
                updated_at = NOW()
            WHERE id = $1::uuid
        `, [terminalId, userId]);

        // C. Crear sesión de caja
        await client.query(`
            INSERT INTO cash_register_sessions (
                id, terminal_id, user_id, opening_amount, status, opened_at
            ) VALUES (
                $1::uuid, $2::uuid, $3::uuid, $4, 'OPEN', NOW()
            )
        `, [newSessionId, terminalId, userId, initialCash]);

        // D. Registrar auditoría
        await insertAuditLog(client, {
            userId,
            terminalId,
            sessionId: newSessionId,
            locationId: terminal.location_id,
            actionCode: 'SESSION_OPEN',
            entityType: 'SESSION',
            entityId: newSessionId,
            newValues: { 
                opening_amount: initialCash,
                terminal_name: terminal.name
            }
        });

        // --- COMMIT ---
        await client.query('COMMIT');

        logger.info({ sessionId: newSessionId, terminalId }, '✅ [Atomic v2.1] Transaction COMMITTED. Session created.');
        revalidatePath('/pos');
        revalidatePath('/caja');

        return { success: true, sessionId: newSessionId };

    } catch (error: any) {
        // --- ROLLBACK ---
        await client.query('ROLLBACK');

        // Manejo específico de errores PostgreSQL
        if (error.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            logger.warn({ terminalId }, '⏳ [Atomic v2.1] Terminal locked by another process');
            return { success: false, error: ERROR_MESSAGES.TERMINAL_LOCKED };
        }

        if (error.code === ERROR_CODES.SERIALIZATION_FAILURE) {
            logger.warn({ terminalId }, '🔄 [Atomic v2.1] Serialization conflict');
            return { success: false, error: ERROR_MESSAGES.SERIALIZATION_ERROR };
        }

        if (error.code === ERROR_CODES.DEADLOCK_DETECTED) {
            logger.warn({ terminalId }, '🔒 [Atomic v2.1] Deadlock detected');
            return { success: false, error: ERROR_MESSAGES.DEADLOCK };
        }

        logger.error({ err: error, terminalId, userId }, '❌ [Atomic v2.1] Transaction ROLLED BACK');
        return { success: false, error: error.message || 'Error de base de datos' };

    } finally {
        client.release();
    }
}

// =====================================================
// FUNCIÓN: CERRAR TERMINAL (ATÓMICA)
// =====================================================

/**
 * Cierra un terminal de forma atómica.
 * Incluye: cierre de sesión, movimiento de caja, remesa opcional.
 * 
 * @param terminalId - UUID del terminal
 * @param userId - ID del usuario/cajero
 * @param finalCash - Monto final declarado
 * @param comments - Comentarios del cierre
 * @param withdrawalAmount - Monto a retirar (remesa)
 */
export async function closeTerminalAtomic(
    terminalId: string,
    userId: string,
    finalCash: number,
    comments: string = '',
    withdrawalAmount: number = 0
): Promise<{ success: boolean; error?: string }> {

    // Validación
    const validation = CloseTerminalSchema.safeParse({ 
        terminalId, userId, finalCash, comments, withdrawalAmount 
    });
    if (!validation.success) {
        logger.warn({ error: validation.error.format() }, 'Invalid input for closeTerminalAtomic');
        return { success: false, error: 'Datos de cierre inválidos' };
    }

    const { pool } = await import('@/lib/db');
    const { v4: uuidv4 } = await import('uuid');
    const client = await pool.connect();

    try {
        logger.info({ terminalId, userId, finalCash }, '🔐 [Atomic v2.1] Starting transaction: Close Terminal');

        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 1. Bloquear terminal con NOWAIT
        const termRes = await client.query(`
            SELECT id, status, current_cashier_id, location_id, name
            FROM terminals 
            WHERE id = $1 
            FOR UPDATE NOWAIT
        `, [terminalId]);

        if (termRes.rows.length === 0) {
            throw new Error(ERROR_MESSAGES.TERMINAL_NOT_FOUND);
        }

        const terminal = termRes.rows[0];

        // 2. Buscar y bloquear sesión activa
        const sessionRes = await client.query(`
            SELECT id, opening_amount, opened_at
            FROM cash_register_sessions 
            WHERE terminal_id = $1 AND user_id = $2 AND status = 'OPEN' AND closed_at IS NULL
            FOR UPDATE NOWAIT
        `, [terminalId, userId]);

        let sessionId: string | null = null;
        let openingAmount: number = 0;

        if (sessionRes.rows.length === 0) {
            logger.warn({ terminalId, userId }, '⚠️ [Atomic v2.1] No active session found for user');
        } else {
            sessionId = sessionRes.rows[0].id;
            openingAmount = Number(sessionRes.rows[0].opening_amount);

            // 3. Cerrar sesión
            await client.query(`
                UPDATE cash_register_sessions 
                SET closed_at = NOW(), 
                    status = 'CLOSED', 
                    closing_amount = $2,
                    notes = $3,
                    expected_closing_amount = $2
                WHERE id = $1
            `, [sessionId, finalCash, comments ? `Cierre Normal: ${comments}` : 'Cierre Normal']);
        }

        // 4. Registrar movimiento de cierre
        const moveId = uuidv4();
        await client.query(`
            INSERT INTO cash_movements (
                id, location_id, terminal_id, session_id, user_id,
                type, amount, reason, timestamp
            ) VALUES (
                $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
                'CIERRE', $6, $7, NOW()
            )
        `, [
            moveId, 
            terminal.location_id, 
            terminalId, 
            sessionId, 
            userId, 
            finalCash, 
            `Cierre de Caja: ${comments}`
        ]);

        // 5. Crear remesa si hay retiro
        let remittanceId: string | null = null;
        if (withdrawalAmount > 0) {
            remittanceId = uuidv4();
            await client.query(`
                INSERT INTO treasury_remittances (
                    id, location_id, source_terminal_id, amount, 
                    status, created_by, created_at
                ) VALUES (
                    $1::uuid, $2::uuid, $3::uuid, $4, 
                    'PENDING_RECEIPT', $5::uuid, NOW()
                )
            `, [remittanceId, terminal.location_id, terminalId, withdrawalAmount, userId]);
        }

        // 6. Cerrar terminal
        await client.query(`
            UPDATE terminals 
            SET status = 'CLOSED', 
                current_cashier_id = NULL, 
                updated_at = NOW()
            WHERE id = $1
        `, [terminalId]);

        // 7. Registrar auditoría
        await insertAuditLog(client, {
            userId,
            terminalId,
            sessionId: sessionId || undefined,
            locationId: terminal.location_id,
            actionCode: 'SESSION_CLOSE',
            entityType: 'SESSION',
            entityId: sessionId || terminalId,
            oldValues: { 
                status: 'OPEN',
                opening_amount: openingAmount
            },
            newValues: { 
                status: 'CLOSED',
                closing_amount: finalCash,
                withdrawal_amount: withdrawalAmount,
                remittance_id: remittanceId
            }
        });

        await client.query('COMMIT');
        logger.info({ terminalId, sessionId }, '✅ [Atomic v2.1] Terminal closed successfully.');

        revalidatePath('/pos');
        revalidatePath('/caja');
        revalidatePath('/finance/treasury');

        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');

        if (error.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            return { success: false, error: ERROR_MESSAGES.TERMINAL_LOCKED };
        }

        if (error.code === ERROR_CODES.SERIALIZATION_FAILURE) {
            return { success: false, error: ERROR_MESSAGES.SERIALIZATION_ERROR };
        }

        logger.error({ err: error, terminalId }, '❌ [Atomic v2.1] Close Failed');
        return { success: false, error: error.message || 'Error cerrando terminal' };

    } finally {
        client.release();
    }
}

// =====================================================
// FUNCIÓN: CIERRE FORZADO (ATÓMICA) - NUEVA
// =====================================================

/**
 * Cierra forzadamente un terminal (para administradores).
 * REQUIERE justificación obligatoria y genera auditoría crítica.
 * 
 * @param terminalId - UUID del terminal
 * @param adminUserId - ID del administrador que fuerza el cierre
 * @param justification - Motivo del cierre forzado (mín. 10 caracteres)
 */
export async function forceCloseTerminalAtomic(
    terminalId: string,
    adminUserId: string,
    justification: string
): Promise<{ success: boolean; error?: string }> {

    // Validación estricta (justificación obligatoria)
    const validation = ForceCloseSchema.safeParse({ terminalId, adminUserId, justification });
    if (!validation.success) {
        logger.warn({ error: validation.error.format() }, 'Invalid input for forceCloseTerminalAtomic');
        return { success: false, error: validation.error.issues[0]?.message || 'Datos inválidos' };
    }

    const { pool } = await import('@/lib/db');
    const client = await pool.connect();

    try {
        logger.info({ terminalId, adminUserId }, '🔐 [Atomic v2.1] Starting FORCE CLOSE transaction');

        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 1. Bloquear terminal
        const termRes = await client.query(`
            SELECT id, status, current_cashier_id, location_id, name
            FROM terminals 
            WHERE id = $1 
            FOR UPDATE NOWAIT
        `, [terminalId]);

        if (termRes.rows.length === 0) {
            throw new Error(ERROR_MESSAGES.TERMINAL_NOT_FOUND);
        }

        const terminal = termRes.rows[0];

        // 2. Obtener sesión activa con datos del usuario para auditoría
        const sessionRes = await client.query(`
            SELECT 
                s.id, s.user_id, s.opening_amount, s.opened_at, s.status,
                u.name as user_name, u.email as user_email
            FROM cash_register_sessions s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.terminal_id = $1 AND s.status = 'OPEN' AND s.closed_at IS NULL
            FOR UPDATE
        `, [terminalId]);

        const oldSession = sessionRes.rows[0] || null;

        // 3. Cerrar sesión si existe
        if (oldSession) {
            await client.query(`
                UPDATE cash_register_sessions
                SET closed_at = NOW(), 
                    status = 'CLOSED_FORCE', 
                    notes = $2
                WHERE id = $1
            `, [oldSession.id, `[CIERRE FORZADO] ${justification}`]);

            logger.info({ sessionId: oldSession.id, originalUser: oldSession.user_name }, 
                '⚠️ [Atomic v2.1] Session force-closed');
        }

        // 4. Cerrar terminal
        await client.query(`
            UPDATE terminals 
            SET status = 'CLOSED', 
                current_cashier_id = NULL,
                updated_at = NOW()
            WHERE id = $1
        `, [terminalId]);

        // 5. AUDITORÍA CRÍTICA (obligatoria para force close)
        await insertAuditLog(client, {
            userId: adminUserId,
            terminalId,
            sessionId: oldSession?.id,
            locationId: terminal.location_id,
            actionCode: 'SESSION_FORCE_CLOSE',
            entityType: 'SESSION',
            entityId: oldSession?.id || terminalId,
            oldValues: oldSession ? {
                status: oldSession.status,
                user_id: oldSession.user_id,
                user_name: oldSession.user_name,
                opened_at: oldSession.opened_at,
                opening_amount: oldSession.opening_amount
            } : null,
            newValues: { 
                status: 'CLOSED_FORCE',
                terminal_name: terminal.name
            },
            justification
        });

        await client.query('COMMIT');
        logger.info({ terminalId, adminUserId }, '✅ [Atomic v2.1] FORCE CLOSE completed.');

        revalidatePath('/pos');
        revalidatePath('/caja');
        revalidatePath('/admin/audit');

        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');

        if (error.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            return { success: false, error: ERROR_MESSAGES.TERMINAL_LOCKED };
        }

        logger.error({ err: error, terminalId, adminUserId }, '❌ [Atomic v2.1] Force Close Failed');
        return { success: false, error: error.message || 'Error en cierre forzado' };

    } finally {
        client.release();
    }
}

// =====================================================
// FUNCIÓN: OBTENER ESTADO DEL TERMINAL
// =====================================================

/**
 * Obtiene el estado actual de un terminal con su sesión activa.
 */
export async function getTerminalStatusAtomic(terminalId: string) {
    try {
        const result = await query(`
            SELECT 
                t.id, t.name, t.status, t.location_id,
                t.current_cashier_id,
                u.name as cashier_name,
                s.id as session_id,
                s.opening_amount,
                s.opened_at
            FROM terminals t
            LEFT JOIN users u ON t.current_cashier_id = u.id
            LEFT JOIN cash_register_sessions s ON (
                s.terminal_id = t.id AND s.status = 'OPEN' AND s.closed_at IS NULL
            )
            WHERE t.id = $1
        `, [terminalId]);

        if (result.rows.length === 0) {
            return { success: false, error: 'Terminal no encontrado' };
        }

        return { success: true, data: result.rows[0] };

    } catch (error: any) {
        logger.error({ err: error, terminalId }, 'Error getting terminal status');
        return { success: false, error: error.message };
    }
}

// =====================================================
// RE-EXPORTS PARA COMPATIBILIDAD
// =====================================================

// Alias para mantener compatibilidad con imports existentes
export { openTerminalAtomic as openTerminal };
export { closeTerminalAtomic as closeTerminal };
export { forceCloseTerminalAtomic as forceCloseTerminalShift };
