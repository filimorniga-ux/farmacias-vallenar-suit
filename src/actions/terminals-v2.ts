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
import {
    getActorOrFail,
    PinRbacError,
    requireRole,
    ROLE_GROUPS,
    validatePinForRoles,
} from '@/lib/pin-rbac';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DBRow = any;

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
    adminUserId: z.string().min(1, { message: "ID de administrador requerido" }), // Can be UUID or 'SYSTEM_AUTOHEAL'
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

const TERMINAL_ADMIN_ROLES = ROLE_GROUPS.ADMIN;

async function resolveValidatedTerminalActor(input: {
    requestedUserId?: string;
    action: string;
    requiredRoles?: readonly string[];
    forbiddenMessage?: string;
}) {
    try {
        let actor = await getActorOrFail();

        if (input.requiredRoles) {
            actor = requireRole(actor, input.requiredRoles);
        }

        if (input.requestedUserId && input.requestedUserId !== actor.userId) {
            logger.warn(
                {
                    requestedUserId: input.requestedUserId,
                    actorUserId: actor.userId,
                    action: input.action,
                },
                'Ignoring payload userId in terminal mutation; using validated session user'
            );
        }

        return {
            success: true as const,
            actorUserId: actor.userId,
            actor,
        };
    } catch (error) {
        if (error instanceof PinRbacError) {
            return {
                success: false as const,
                error: error.code === 'AUTH_FORBIDDEN'
                    ? (input.forbiddenMessage || 'Acceso denegado')
                    : 'Sesión no válida. Vuelve a iniciar sesión.',
            };
        }

        throw error;
    }
}

// =====================================================
// HELPER: Insertar Auditoría
// =====================================================

async function insertAuditLog(
    client: { query: (sql: string, params?: (string | number | boolean | null | undefined | object)[]) => Promise<DBRow> },
    params: {
        userId: string | null;
        userName?: string;
        terminalId: string;
        sessionId?: string;
        locationId?: string;
        actionCode: string;
        entityType: string;
        entityId: string;
        oldValues?: Record<string, unknown>;
        newValues?: Record<string, unknown>;
        justification?: string;
    }
) {
    try {
        // Handle non-UUID userId (e.g. SYSTEM_AUTOHEAL)
        let finalUserId = params.userId;
        let finalUserName = params.userName;

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (finalUserId && !uuidRegex.test(finalUserId)) {
            if (!finalUserName) finalUserName = finalUserId;
            finalUserId = null;
        }

        await client.query(`
            INSERT INTO audit_log (
                user_id, user_name, terminal_id, session_id, location_id,
                action_code, entity_type, entity_id,
                old_values, new_values, justification
            ) VALUES (
                $1::uuid, $2, $3::uuid, $4::uuid, $5::uuid,
                $6, $7, $8,
                $9::jsonb, $10::jsonb, $11
            )
        `, [
            finalUserId || null,
            finalUserName || null,
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
    } catch (auditError: unknown) {
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

    const actor = await resolveValidatedTerminalActor({
        requestedUserId: userId,
        action: 'openTerminalAtomic',
    });
    if (!actor.success) {
        return { success: false, error: actor.error };
    }
    const actorUserId = actor.actorUserId;

    const { pool } = await import('@/lib/db');
    const client = await pool.connect();

    try {
        logger.info({ terminalId, userId: actorUserId, initialCash }, '🔐 [Atomic v2.1] Starting transaction: Open Terminal');

        // --- INICIO DE TRANSACCIÓN ---
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 2. Check Idempotency (si ya tiene sesión activa, retornarla)
        const existingSession = await client.query(`
            SELECT id FROM cash_register_sessions 
            WHERE terminal_id = $1 AND user_id = $2 AND closed_at IS NULL
        `, [terminalId, actorUserId]);

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
        if (terminal.status === 'OPEN' && terminal.current_cashier_id !== actorUserId) {
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
        `, [actorUserId]);

        if (ghostCleanup.rowCount && ghostCleanup.rowCount > 0) {
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
                'OPENING', $6, 'Apertura de Caja', NOW()
            )
        `, [moveId, terminal.location_id, terminalId, newSessionId, actorUserId, initialCash]);

        // B. Actualizar estado del terminal
        await client.query(`
            UPDATE terminals 
            SET status = 'OPEN', 
                current_cashier_id = $2::uuid, 
                updated_at = NOW()
            WHERE id = $1::uuid
        `, [terminalId, actorUserId]);

        // C. Crear sesión de caja
        await client.query(`
            INSERT INTO cash_register_sessions (
                id, terminal_id, user_id, opening_amount, status, opened_at
            ) VALUES (
                $1::uuid, $2::uuid, $3::uuid, $4, 'OPEN', NOW()
            )
        `, [newSessionId, terminalId, actorUserId, initialCash]);

        // D. Registrar auditoría
        await insertAuditLog(client, {
            userId: actorUserId,
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

    } catch (error: unknown) {
        // --- ROLLBACK ---
        await client.query('ROLLBACK');

        const err = error as { code?: string; message?: string };

        // Manejo específico de errores PostgreSQL
        if (err.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            logger.warn({ terminalId }, '⏳ [Atomic v2.1] Terminal locked by another process');
            return { success: false, error: ERROR_MESSAGES.TERMINAL_LOCKED };
        }

        if (err.code === ERROR_CODES.SERIALIZATION_FAILURE) {
            logger.warn({ terminalId }, '🔄 [Atomic v2.1] Serialization conflict');
            return { success: false, error: ERROR_MESSAGES.SERIALIZATION_ERROR };
        }

        if (err.code === ERROR_CODES.DEADLOCK_DETECTED) {
            logger.warn({ terminalId }, '🔒 [Atomic v2.1] Deadlock detected');
            return { success: false, error: ERROR_MESSAGES.DEADLOCK };
        }

        logger.error({ err: error, terminalId, userId: actorUserId }, '❌ [Atomic v2.1] Transaction ROLLED BACK');
        return { success: false, error: err.message || 'Error de base de datos' };

    } finally {
        client.release();
    }
}

// =====================================================
// FUNCIÓN: ABRIR TERMINAL CON VALIDACIÓN DE PIN (SEGURA)
// =====================================================

/**
 * Abre un terminal validando el PIN del supervisor en el servidor.
 * 
 * SECURITY FIX: Esta función reemplaza la validación de PIN en el cliente.
 * El PIN se valida server-side y la autorización queda separada del actor real.
 * 
 * @param terminalId - UUID del terminal
 * @param userId - ID del usuario/cajero
 * @param initialCash - Monto inicial de apertura
 * @param supervisorPin - PIN del supervisor
 * @returns Resultado con sessionId y authorizedById o error
 */
export async function openTerminalWithPinValidation(
    terminalId: string,
    userId: string,
    initialCash: number,
    supervisorPin: string
): Promise<{
    success: boolean;
    sessionId?: string;
    authorizedById?: string;
    autoCheckInTriggered?: boolean;
    error?: string
}> {

    // 1. Validación de inputs
    const validation = OpenTerminalSchema.safeParse({ terminalId, userId, initialCash });
    if (!validation.success) {
        logger.warn({ userId, terminalId }, 'Invalid input for openTerminalWithPinValidation');
        return { success: false, error: validation.error.issues[0]?.message || 'Datos inválidos' };
    }

    if (!supervisorPin || supervisorPin.length < 4) {
        return { success: false, error: 'PIN de autorización requerido' };
    }

    const actor = await resolveValidatedTerminalActor({
        requestedUserId: userId,
        action: 'openTerminalWithPinValidation',
    });
    if (!actor.success) {
        return { success: false, error: actor.error };
    }
    const actorUserId = actor.actorUserId;

    const { pool } = await import('@/lib/db');
    const client = await pool.connect();

    try {
        const dbHost = process.env.DATABASE_URL?.split('@')[1]?.split(':')[0] || 'unknown';
        logger.info({ terminalId, userId: actorUserId, initialCash, dbHost }, '🔐 [Atomic v2.2] Starting secure transaction: Open Terminal with PIN validation');

        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        const authResult = await validatePinForRoles(client, supervisorPin, ROLE_GROUPS.MANAGER, {
            allowLegacyPlaintext: true,
            useRateLimiter: true,
        });

        if (!authResult.valid) {
            await client.query('ROLLBACK');
            logger.warn({ userId: actorUserId, terminalId }, '🚫 PIN validation failed - no matching supervisor');
            return { success: false, error: authResult.error || 'PIN de autorización inválido' };
        }

        const authorizedBy = authResult.authorizedBy;
        logger.info({ authorizedById: authorizedBy.id }, '✅ Supervisor PIN validated successfully');

        // 3. Check Idempotency (si ya tiene sesión activa, retornarla)
        const existingSession = await client.query(`
            SELECT id FROM cash_register_sessions 
            WHERE terminal_id = $1 AND user_id = $2 AND closed_at IS NULL
        `, [terminalId, actorUserId]);

        if (existingSession.rows.length > 0) {
            await client.query('COMMIT');
            logger.info({ sessionId: existingSession.rows[0].id }, '✅ Session already exists. Returning existing ID.');
            return {
                success: true,
                sessionId: existingSession.rows[0].id,
                authorizedById: authorizedBy.id
            };
        }

        // 4. BLOQUEO PESIMISTA con NOWAIT
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

        // 5. Verificar disponibilidad
        if (terminal.status === 'OPEN' && terminal.current_cashier_id !== actorUserId) {
            throw new Error(ERROR_MESSAGES.TERMINAL_OCCUPIED);
        }

        // 6. Auto-cleanup de sesiones ghost del usuario
        await client.query(`
            UPDATE cash_register_sessions 
            SET closed_at = NOW(), 
                status = 'CLOSED_AUTO', 
                notes = 'Auto-cerrada por nueva apertura en otro terminal'
            WHERE user_id = $1 AND closed_at IS NULL
        `, [actorUserId]);

        // 7. Generar UUIDs
        const { v4: uuidv4 } = await import('uuid');
        const newSessionId = uuidv4();
        const moveId = uuidv4();

        // 8. OPERACIONES ATÓMICAS

        // A. Crear sesión de caja PRIMERO (para satisfacer FK)
        await client.query(`
            INSERT INTO cash_register_sessions (
                id, terminal_id, user_id, opening_amount, status, opened_at, authorized_by
            ) VALUES (
                $1::uuid, $2::uuid, $3::uuid, $4, 'OPEN', NOW(), $5::uuid
            )
        `, [newSessionId, terminalId, actorUserId, initialCash, authorizedBy.id]);

        // B. Insertar movimiento de caja (apertura) DESPUÉS de crear la sesión
        await client.query(`
            INSERT INTO cash_movements (
                id, location_id, terminal_id, session_id, user_id, 
                type, amount, reason, timestamp
            ) VALUES (
                $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
                'OPENING', $6, 'Apertura de Caja', NOW()
            )
        `, [moveId, terminal.location_id, terminalId, newSessionId, actorUserId, initialCash]);

        // C. Actualizar estado del terminal
        await client.query(`
            UPDATE terminals 
            SET status = 'OPEN', 
                current_cashier_id = $2::uuid, 
                updated_at = NOW()
            WHERE id = $1::uuid
        `, [terminalId, actorUserId]);

        // D. Registrar auditoría
        await insertAuditLog(client, {
            userId: actorUserId,
            terminalId,
            sessionId: newSessionId,
            locationId: terminal.location_id,
            actionCode: 'SESSION_OPEN_AUTHORIZED',
            entityType: 'SESSION',
            entityId: newSessionId,
            newValues: {
                opening_amount: initialCash,
                terminal_name: terminal.name,
                authorized_by: authorizedBy.name
            }
        });

        // --- COMMIT ---
        await client.query('COMMIT');

        logger.info({ sessionId: newSessionId, terminalId, authorizedById: authorizedBy.id }, '✅ [Atomic v2.2] Transaction COMMITTED. Secure session created.');
        revalidatePath('/pos');
        revalidatePath('/caja');

        // 🤖 AUTO-CHECK-IN: Si el cajero abre turno, debe estar 'presente'
        const { ensureCheckInSecure } = await import('@/actions/attendance-v2');
        // Validar asistencia para el CAJERO (userId), no necesariamente el manager
        const autoCheckInTriggered = await ensureCheckInSecure(actorUserId, terminal.location_id);

        return {
            success: true,
            sessionId: newSessionId,
            authorizedById: authorizedBy.id,
            autoCheckInTriggered
        };

    } catch (error: unknown) {
        await client.query('ROLLBACK');

        const err = error as { code?: string; message?: string };

        if (err.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            logger.warn({ terminalId }, '⏳ Terminal locked by another process');
            return { success: false, error: ERROR_MESSAGES.TERMINAL_LOCKED };
        }

        if (err.code === ERROR_CODES.SERIALIZATION_FAILURE) {
            logger.warn({ terminalId }, '🔄 Serialization conflict');
            return { success: false, error: ERROR_MESSAGES.SERIALIZATION_ERROR };
        }

        logger.error({ err: error, terminalId, userId: actorUserId }, '❌ [Atomic v2.2] Transaction ROLLED BACK');
        return { success: false, error: err.message || 'Error de base de datos' };

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

    const actor = await resolveValidatedTerminalActor({
        requestedUserId: userId,
        action: 'closeTerminalAtomic',
    });
    if (!actor.success) {
        return { success: false, error: actor.error };
    }
    const actorUserId = actor.actorUserId;

    const { pool } = await import('@/lib/db');
    const { v4: uuidv4 } = await import('uuid');
    const client = await pool.connect();

    try {
        logger.info({ terminalId, userId: actorUserId, finalCash }, '🔐 [Atomic v2.1] Starting transaction: Close Terminal');

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
        `, [terminalId, actorUserId]);

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
            actorUserId,
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
            `, [remittanceId, terminal.location_id, terminalId, withdrawalAmount, actorUserId]);
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
            userId: actorUserId,
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
        revalidatePath('/settings');
        revalidatePath('/finance/treasury');

        return { success: true };

    } catch (error: unknown) {
        await client.query('ROLLBACK');

        const err = error as { code?: string; message?: string };

        if (err.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            return { success: false, error: ERROR_MESSAGES.TERMINAL_LOCKED };
        }

        if (err.code === ERROR_CODES.SERIALIZATION_FAILURE) {
            return { success: false, error: ERROR_MESSAGES.SERIALIZATION_ERROR };
        }

        logger.error({ err: error, terminalId }, '❌ [Atomic v2.1] Close Failed');
        return { success: false, error: err.message || 'Error cerrando terminal' };

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
export async function forceCloseTerminalSecure(
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

    const actor = await resolveValidatedTerminalActor({
        requestedUserId: adminUserId,
        action: 'forceCloseTerminalSecure',
        requiredRoles: TERMINAL_ADMIN_ROLES,
        forbiddenMessage: 'Acceso denegado: requiere rol de administrador',
    });
    if (!actor.success) {
        return { success: false, error: actor.error };
    }
    const actorUserId = actor.actorUserId;

    const { pool } = await import('@/lib/db');
    const client = await pool.connect();

    try {
        logger.info({ terminalId, adminUserId: actorUserId }, '🔐 [Atomic v2.1] Starting FORCE CLOSE transaction');

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
        // 2. Obtener sesión activa (Bloqueo directo SÓLO en la tabla de sesiones)
        // FIX: No usar LEFT JOIN con FOR UPDATE para evitar error "nullable side of outer join"
        const sessionRes = await client.query(`
            SELECT 
                id, user_id, opening_amount, opened_at, status
            FROM cash_register_sessions 
            WHERE terminal_id = $1 AND status = 'OPEN' AND closed_at IS NULL
            FOR UPDATE
        `, [terminalId]);

        let oldSession: DBRow | null = null;

        if (sessionRes.rows.length > 0) {
            const session = sessionRes.rows[0];

            // Obtener datos del usuario por separado (lectura sin bloqueo)
            let userName = 'Desconocido';
            let userEmail = '';

            if (session.user_id) {
                const userRes = await client.query(
                    'SELECT name, email FROM users WHERE id = $1',
                    [session.user_id]
                );
                if (userRes.rows.length > 0) {
                    userName = userRes.rows[0].name;
                    userEmail = userRes.rows[0].email;
                }
            }

            oldSession = {
                ...session,
                user_name: userName,
                user_email: userEmail
            };
        }

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
            userId: actorUserId,
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
            } : undefined,
            newValues: {
                status: 'CLOSED_FORCE',
                closed_by: actorUserId,
                reason: justification
            },
            justification: `CIERRE FORZADO: ${justification}`
        });

        await client.query('COMMIT');
        logger.info({ terminalId }, '✅ [Atomic v2.1] Terminal force-closed successfully');

        revalidatePath('/pos');
        revalidatePath('/caja');
        revalidatePath('/settings');

        return { success: true };

    } catch (error: unknown) {
        await client.query('ROLLBACK');
        logger.error({ err: error, terminalId }, '❌ [Atomic v2.1] Force Close Failed');
        return { success: false, error: (error as Error).message || 'Error forzando cierre' };

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
                t.id, t.name, t.status, t.location_id, t.module_number,
                CASE
                    WHEN t.status = 'OPEN' AND s.id IS NULL THEN NULL
                    ELSE COALESCE(s.user_id::text, t.current_cashier_id::text)
                END as current_cashier_id,
                u.name as cashier_name,
                s.id as session_id,
                s.opening_amount,
                s.opened_at
            FROM terminals t
            LEFT JOIN LATERAL (
                SELECT id, user_id, opening_amount, opened_at
                FROM cash_register_sessions
                WHERE terminal_id = t.id
                  AND status = 'OPEN'
                  AND closed_at IS NULL
                ORDER BY opened_at DESC
                LIMIT 1
            ) s ON TRUE
            LEFT JOIN users u ON u.id::text = CASE
                WHEN t.status = 'OPEN' AND s.id IS NULL THEN NULL
                ELSE COALESCE(s.user_id::text, t.current_cashier_id::text)
            END
            WHERE t.id = $1
        `, [terminalId]);

        if (result.rows.length === 0) {
            return { success: false, error: 'Terminal no encontrado' };
        }

        return { success: true, data: result.rows[0] };

    } catch (error: unknown) {
        logger.error({ err: error, terminalId }, 'Error getting terminal status');
        return { success: false, error: (error as Error).message };
    }
}

// =====================================================
// FUNCIÓN: LISTAR TERMINALES POR UBICACIÓN (SEGURA)
// =====================================================

/**
 * Obtiene lista de terminales por ubicación con RBAC.
 * 
 * @param locationId - UUID de la ubicación (opcional, si no se pasa retorna todos)
 * @returns Lista de terminales
 */
export async function getTerminalsByLocationSecure(locationId?: string): Promise<{
    success: boolean;
    data?: DBRow[];
    error?: string;
}> {
    try {
        let sql = `
            SELECT 
                t.id, t.name, t.location_id,
                CASE
                    WHEN t.status = 'OPEN' AND s.session_id IS NULL THEN 'CLOSED'
                    ELSE t.status
                END as status,
                CASE
                    WHEN t.status = 'OPEN' AND s.session_id IS NULL THEN NULL
                    ELSE COALESCE(s.user_id::text, t.current_cashier_id::text)
                END as current_cashier_id,
                t.config, t.is_active, t.module_number,
                s.session_id,
                s.opened_at as session_opened_at,
                l.name as location_name,
                u.name as current_cashier_name
            FROM terminals t
            LEFT JOIN locations l ON l.id = t.location_id
            LEFT JOIN LATERAL (
                SELECT id as session_id, user_id, opened_at
                FROM cash_register_sessions
                WHERE terminal_id = t.id
                  AND status = 'OPEN'
                  AND closed_at IS NULL
                ORDER BY opened_at DESC
                LIMIT 1
            ) s ON TRUE
            LEFT JOIN users u ON u.id::text = CASE
                WHEN t.status = 'OPEN' AND s.session_id IS NULL THEN NULL
                ELSE COALESCE(s.user_id::text, t.current_cashier_id::text)
            END
            WHERE t.is_active = true AND t.deleted_at IS NULL
        `;
        const params: (string | number | boolean | Date)[] = [];

        if (locationId) {
            sql += ` AND t.location_id = $1`;
            params.push(locationId);
        }

        sql += ` ORDER BY l.name, t.name`;

        const result = await query(sql, params);

        // Serializar para Next.js Server Actions
        const serializedData = JSON.parse(JSON.stringify(result.rows));

        return { success: true, data: serializedData };

    } catch (error: unknown) {
        logger.error({ error, locationId }, '[TerminalsV2] getTerminalsByLocationSecure error');
        return { success: false, error: (error as Error).message || 'Error obteniendo terminales' };
    }
}

// =====================================================
// FUNCIÓN: ACTUALIZAR TERMINAL (SEGURA)
// =====================================================

const UpdateTerminalSchema = z.object({
    terminalId: z.string().uuid(),
    name: z.string().min(1).max(100).optional(),
    module_number: z.string().max(20).optional(),
    type: z.enum(['POS', 'KIOSK', 'SELF_SERVICE']).optional(),
    printer_config: z.record(z.string(), z.unknown()).optional(),
});


/**
 * Actualiza un terminal con RBAC y auditoría.
 */
export async function updateTerminalSecure(
    terminalId: string,
    data: { name?: string; module_number?: string; type?: string; printer_config?: Record<string, unknown> }
): Promise<{ success: boolean; error?: string }> {
    const validation = UpdateTerminalSchema.safeParse({ terminalId, ...data });
    if (!validation.success) {
        return { success: false, error: validation.error.issues[0]?.message || 'Datos inválidos' };
    }

    const actor = await resolveValidatedTerminalActor({
        action: 'updateTerminalSecure',
        requiredRoles: TERMINAL_ADMIN_ROLES,
        forbiddenMessage: 'Acceso denegado: requiere rol de administrador',
    });
    if (!actor.success) {
        return {
            success: false,
            error: actor.error.includes('Sesión no válida') ? 'No autenticado' : actor.error,
        };
    }

    try {

        // Obtener datos actuales para auditoría
        const current = await query('SELECT name, type, printer_config FROM terminals WHERE id = $1', [terminalId]);
        if (current.rows.length === 0) {
            return { success: false, error: 'Terminal no encontrado' };
        }

        const updates: string[] = [];
        const values: (string | number | boolean | Date)[] = [];
        let paramIndex = 1;

        if (data.name !== undefined) {
            updates.push(`name = $${paramIndex++}`);
            values.push(data.name);
        }
        if (data.module_number !== undefined) {
            updates.push(`module_number = $${paramIndex++}`);
            values.push(data.module_number);
        }
        if (data.type !== undefined) {
            updates.push(`type = $${paramIndex++}`);
            values.push(data.type);
        }
        if (data.printer_config !== undefined) {
            updates.push(`printer_config = $${paramIndex++}`);
            values.push(JSON.stringify(data.printer_config));
        }

        if (updates.length === 0) {
            return { success: false, error: 'No hay cambios para aplicar' };
        }

        updates.push(`updated_at = NOW()`);
        values.push(terminalId);

        await query(
            `UPDATE terminals SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
            values
        );

        // Auditoría
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, old_values, new_values, timestamp)
            VALUES ($1, 'TERMINAL_UPDATE', 'TERMINAL', $2, $3, $4, NOW())
        `, [actor.actorUserId, terminalId, JSON.stringify(current.rows[0]), JSON.stringify(data)]);

        logger.info({ terminalId, userId: actor.actorUserId }, '✅ Terminal actualizado');
        revalidatePath('/settings');
        revalidatePath('/settings/organization');

        return { success: true };

    } catch (error: unknown) {
        logger.error({ error, terminalId }, '[TerminalsV2] updateTerminalSecure error');
        return { success: false, error: (error as Error).message || 'Error actualizando terminal' };
    }
}

// =====================================================
// FUNCIÓN: ELIMINAR TERMINAL (SEGURA - SOFT DELETE)
// =====================================================

/**
 * Elimina (soft delete) un terminal con RBAC y auditoría.
 * Solo permite eliminar terminales cerrados.
 */
export async function deleteTerminalSecure(
    terminalId: string
): Promise<{ success: boolean; error?: string }> {
    if (!terminalId || !z.string().uuid().safeParse(terminalId).success) {
        return { success: false, error: 'ID de terminal inválido' };
    }

    const actor = await resolveValidatedTerminalActor({
        action: 'deleteTerminalSecure',
        requiredRoles: TERMINAL_ADMIN_ROLES,
        forbiddenMessage: 'Acceso denegado: requiere rol de administrador',
    });
    if (!actor.success) {
        return {
            success: false,
            error: actor.error.includes('Sesión no válida') ? 'No autenticado' : actor.error,
        };
    }

    try {

        // Verificar estado del terminal
        const terminal = await query(
            'SELECT id, name, status, location_id FROM terminals WHERE id = $1',
            [terminalId]
        );

        if (terminal.rows.length === 0) {
            return { success: false, error: 'Terminal no encontrado' };
        }

        if (terminal.rows[0].status === 'OPEN') {
            return { success: false, error: 'No se puede eliminar un terminal abierto. Ciérrelo primero.' };
        }

        // Soft delete
        await query(
            `UPDATE terminals SET status = 'DELETED', updated_at = NOW() WHERE id = $1`,
            [terminalId]
        );

        // Auditoría
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, old_values, timestamp)
            VALUES ($1, 'TERMINAL_DELETE', 'TERMINAL', $2, $3, NOW())
        `, [actor.actorUserId, terminalId, JSON.stringify(terminal.rows[0])]);

        logger.info({ terminalId, userId: actor.actorUserId }, '🗑️ Terminal eliminado (soft delete)');
        revalidatePath('/settings');
        revalidatePath('/settings/organization');

        return { success: true };

    } catch (error: unknown) {
        logger.error({ error, terminalId }, '[TerminalsV2] deleteTerminalSecure error');
        return { success: false, error: (error as Error).message || 'Error eliminando terminal' };
    }
}

// =====================================================
// RE-EXPORTS PARA COMPATIBILIDAD
// =====================================================

// Alias para mantener compatibilidad con imports existentes
export { openTerminalAtomic as openTerminal };
export { closeTerminalAtomic as closeTerminal };
export { forceCloseTerminalSecure as forceCloseTerminalShift };
export { updateTerminalSecure as updateTerminal };
/* export { deleteTerminalSecure as deleteTerminal }; // Moved to network-v2 */

// =====================================================
// FUNCIÓN: OBTENER SESIÓN ACTIVA DE UN TERMINAL
// =====================================================

/**
 * 🔍 Obtiene la sesión activa de un terminal para el POS
 * 
 * Esta función es usada por el frontend de caja para:
 * - Validar que hay una sesión abierta antes de vender
 * - Obtener el sessionId para asociar ventas
 * 
 * @param terminalId - UUID del terminal
 * @returns Información de la sesión activa o error
 */
export async function getActiveSession(terminalId: string): Promise<{
    success: boolean;
    data?: {
        sessionId: string;
        terminalName: string;
        openedAt: string;
        userId: string;
        openingAmount: number;
    };
    error?: string;
}> {
    // Validar UUID
    if (!terminalId || !z.string().uuid().safeParse(terminalId).success) {
        return { success: false, error: 'ID de terminal inválido' };
    }

    try {
        const result = await query(`
            SELECT 
                s.id as session_id,
                s.user_id,
                s.opening_amount,
                s.opened_at,
                t.name as terminal_name,
                t.status as terminal_status
            FROM cash_register_sessions s
            INNER JOIN terminals t ON t.id = s.terminal_id
            WHERE s.terminal_id = $1
              AND s.status = 'OPEN'
              AND s.closed_at IS NULL
            ORDER BY s.opened_at DESC
            LIMIT 1
        `, [terminalId]);

        if (result.rows.length === 0) {
            return {
                success: false,
                error: 'No hay sesión de caja activa. Abra turno para comenzar.'
            };
        }

        const session = result.rows[0];

        return {
            success: true,
            data: {
                sessionId: session.session_id,
                terminalName: session.terminal_name,
                openedAt: session.opened_at?.toISOString?.() || String(session.opened_at),
                userId: session.user_id,
                openingAmount: Number(session.opening_amount) || 0
            }
        };

    } catch (error: unknown) {
        logger.error({ error, terminalId }, '[TerminalsV2] getActiveSession error');
        return { success: false, error: 'Error verificando sesión de caja' };
    }
}

// =====================================================
// FUNCIÓN: OBTENER MONTO SUGERIDO (CARRYOVER)
// =====================================================

/**
 * Obtiene el monto sugerido para apertura basado en el cierre anterior.
 * Calculado como: Monto Cierre Anterior - Remesa Generada = Efectivo en Caja
 */
export async function getSuggestedOpeningAmount(terminalId: string): Promise<{ success: boolean; amount?: number; lastUser?: string; error?: string }> {
    const { pool } = await import('@/lib/db');
    const client = await pool.connect();

    try {
        // Se analizan varias sesiones cerradas para evitar falsos 0 cuando
        // la más reciente fue cerrada forzosamente sin arqueo final.
        const sessionRes = await client.query(`
            SELECT
                s.id,
                s.status,
                s.user_id,
                s.closed_at,
                COALESCE(s.opening_amount, 0) AS opening_amount,
                COALESCE(s.closing_amount, 0) AS closing_amount,
                COALESCE((
                    SELECT SUM(COALESCE(sa.total_amount, sa.total))
                    FROM sales sa
                    WHERE sa.session_id = s.id
                      AND sa.status != 'VOIDED'
                      AND sa.payment_method = 'CASH'
                ), 0) AS cash_sales,
                COALESCE((
                    SELECT SUM(CASE WHEN cm.type IN ('IN', 'EXTRA_INCOME') THEN cm.amount ELSE 0 END)
                    FROM cash_movements cm
                    WHERE cm.session_id = s.id
                      AND cm.type NOT IN ('APERTURA', 'OPENING')
                ), 0) AS cash_in,
                COALESCE((
                    SELECT SUM(CASE WHEN cm.type IN ('OUT', 'WITHDRAWAL', 'EXPENSE') THEN cm.amount ELSE 0 END)
                    FROM cash_movements cm
                    WHERE cm.session_id = s.id
                      AND cm.type NOT IN ('APERTURA', 'OPENING')
                ), 0) AS cash_out,
                COALESCE((
                    SELECT SUM(tr.amount)
                    FROM treasury_remittances tr
                    WHERE tr.source_terminal_id = s.terminal_id
                      AND tr.created_at BETWEEN (s.closed_at - interval '2 minutes')
                                            AND (s.closed_at + interval '2 minutes')
                ), 0) AS remittance_amount,
                u.name AS user_name
            FROM cash_register_sessions s
            LEFT JOIN users u ON u.id::text = s.user_id::text
            WHERE s.terminal_id = $1
              AND s.status IN ('CLOSED', 'CLOSED_FORCE', 'CLOSED_AUTO')
              AND s.closed_at IS NOT NULL
            ORDER BY s.closed_at DESC
            LIMIT 10
        `, [terminalId]);

        if (sessionRes.rows.length === 0) {
            return { success: true, amount: 0 };
        }

        const latestUser = sessionRes.rows[0]?.user_name || 'Usuario desconocido';

        let fallbackSuggestion: { amount: number; user: string } | null = null;

        for (const session of sessionRes.rows) {
            const closingAmount = Number(session.closing_amount || 0);
            const openingAmount = Number(session.opening_amount || 0);
            const cashSales = Number(session.cash_sales || 0);
            const cashIn = Number(session.cash_in || 0);
            const cashOut = Number(session.cash_out || 0);
            const remittanceAmount = Number(session.remittance_amount || 0);

            // Cierre efectivo + calidad:
            // strong = arqueo explícito o trazas de sesión (ventas/movimientos)
            // weak = fallback técnico (opening_amount) cuando no hay más señales.
            const estimatedFromTrace = Math.max(0, openingAmount + cashSales + cashIn - cashOut);
            const hasTraceSignals = cashSales > 0 || cashIn > 0 || cashOut > 0;

            let effectiveClosing = 0;
            let quality: 'none' | 'strong' | 'weak' = 'none';
            if (closingAmount > 0) {
                effectiveClosing = closingAmount;
                quality = 'strong';
            } else if (estimatedFromTrace > 0 && hasTraceSignals) {
                effectiveClosing = estimatedFromTrace;
                quality = 'strong';
            } else if (['CLOSED_FORCE', 'CLOSED_AUTO'].includes(session.status) && openingAmount > 0) {
                effectiveClosing = openingAmount;
                quality = 'weak';
            } else if (estimatedFromTrace > 0) {
                effectiveClosing = estimatedFromTrace;
                quality = 'weak';
            }

            const suggestedAmount = Math.max(0, effectiveClosing - remittanceAmount);
            if (suggestedAmount <= 0 || quality === 'none') {
                continue;
            }

            // Priorización temporal:
            // 1) primera sesión fuerte más reciente (inmediata continuidad real)
            // 2) si no existe, usar primer fallback débil.
            if (quality === 'strong') {
                return {
                    success: true,
                    amount: suggestedAmount,
                    lastUser: session.user_name || latestUser
                };
            }

            if (!fallbackSuggestion) {
                fallbackSuggestion = {
                    amount: suggestedAmount,
                    user: session.user_name || latestUser
                };
            }
        }

        if (fallbackSuggestion) {
            return {
                success: true,
                amount: fallbackSuggestion.amount,
                lastUser: fallbackSuggestion.user
            };
        }

        return {
            success: true,
            amount: 0,
            lastUser: latestUser
        };

    } catch (error: unknown) {
        logger.error({ error, terminalId }, '[TerminalsV2] getSuggestedOpeningAmount error');
        return { success: false, error: 'Error calculando sugerencia' };
    } finally {
        client.release();
    }
}
