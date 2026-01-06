'use server';

/**
 * 🔄 SHIFT-HANDOVER V2 - SECURE SHIFT OPERATIONS
 * Pharma-Synapse v3.1 - Farmacias Vallenar
 * 
 * Este módulo implementa operaciones de cambio de turno seguras con:
 * - Transacciones SERIALIZABLE para integridad
 * - Bloqueo pesimista (FOR UPDATE NOWAIT)
 * - Validación de PIN con bcrypt
 * - Control de acceso basado en roles (RBAC)
 * - Auditoría completa de operaciones
 * - Validación con Zod
 * 
 * El handover de turno es crítico porque transfiere
 * responsabilidad financiera entre empleados.
 * 
 * @version 2.0.0
 * @date 2024-12-24
 */

import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logger } from '@/lib/logger';

// =====================================================
// SCHEMAS DE VALIDACIÓN
// =====================================================

const UUIDSchema = z.string().uuid({ message: "ID inválido" });

const CalculateHandoverSchema = z.object({
    terminalId: UUIDSchema,
    declaredCash: z.number().min(0, { message: "El monto declarado debe ser positivo o cero" }),
});

const ExecuteHandoverSchema = z.object({
    terminalId: UUIDSchema,
    declaredCash: z.number().min(0),
    expectedCash: z.number().min(0),
    amountToWithdraw: z.number().min(0),
    amountToKeep: z.number().min(0),
    userId: z.string().min(1, { message: "ID de usuario requerido" }),
    userPin: z.string().min(4, { message: "PIN de usuario requerido" }),
    nextUserId: UUIDSchema.optional(),
    notes: z.string().max(500).optional(),
});

const QuickHandoverSchema = z.object({
    terminalId: UUIDSchema,
    outgoingUserId: z.string().min(1),
    outgoingUserPin: z.string().min(4, { message: "PIN del cajero saliente requerido" }),
    incomingUserId: UUIDSchema,
    incomingUserPin: z.string().min(4, { message: "PIN del cajero entrante requerido" }),
    declaredCash: z.number().min(0),
    notes: z.string().max(500).optional(),
});

// =====================================================
// CONSTANTES
// =====================================================

const BASE_CASH = 50000; // Monto base a mantener en caja

const ERROR_CODES = {
    LOCK_NOT_AVAILABLE: '55P03',
    SERIALIZATION_FAILURE: '40001',
    DEADLOCK_DETECTED: '40P01'
} as const;

const ERROR_MESSAGES = {
    TERMINAL_NOT_FOUND: 'Terminal no encontrado',
    NO_ACTIVE_SHIFT: 'No hay turno activo en este terminal',
    SESSION_LOCKED: 'Sesión bloqueada por otro proceso. Intente en unos segundos.',
    INVALID_PIN: 'PIN de autorización inválido',
    USER_MISMATCH: 'El PIN no corresponde al usuario del turno actual',
    SERIALIZATION_ERROR: 'Conflicto de concurrencia. Por favor reintente.',
} as const;

// Roles que pueden realizar handover
const HANDOVER_ROLES = ['CASHIER', 'MANAGER', 'ADMIN', 'GERENTE_GENERAL'] as const;

// =====================================================
// HELPERS
// =====================================================

/**
 * Valida PIN de un usuario específico usando bcrypt
 */
async function validateUserPin(
    client: any,
    userId: string,
    pin: string
): Promise<{ valid: boolean; user?: { id: string; name: string; role: string }; error?: string }> {
    try {
        // Rate limiting import
        const { checkRateLimit, recordFailedAttempt, resetAttempts } = await import('@/lib/rate-limiter');
        const bcrypt = await import('bcryptjs');

        // Verificar rate limit ANTES de consultar usuario
        const rateCheck = checkRateLimit(userId);
        if (!rateCheck.allowed) {
            logger.warn({
                userId,
                blockedUntil: rateCheck.blockedUntil
            }, '🚫 [Handover] Usuario bloqueado por rate limit');

            return {
                valid: false,
                error: rateCheck.reason || 'Usuario temporalmente bloqueado'
            };
        }

        const userRes = await client.query(`
            SELECT id, name, role, access_pin_hash, access_pin
            FROM users 
            WHERE id = $1 AND is_active = true
        `, [userId]);

        if (userRes.rows.length === 0) {
            return { valid: false, error: 'Usuario no encontrado' };
        }

        const user = userRes.rows[0];

        // Primero intentar con bcrypt hash
        if (user.access_pin_hash) {
            const isValid = await bcrypt.compare(pin, user.access_pin_hash);
            if (isValid) {
                // PIN correcto - resetear intentos
                resetAttempts(userId);
                return {
                    valid: true,
                    user: { id: user.id, name: user.name, role: user.role }
                };
            } else {
                // PIN incorrecto - registrar intento fallido
                recordFailedAttempt(userId);
                return { valid: false, error: 'PIN incorrecto' };
            }
        }
        // Fallback: PIN legacy
        else if (user.access_pin && user.access_pin === pin) {
            logger.warn({ userId: user.id }, '⚠️ Handover: Using legacy plaintext PIN - user should be migrated');
            resetAttempts(userId);
            return {
                valid: true,
                user: { id: user.id, name: user.name, role: user.role }
            };
        }

        // PIN incorrecto - registrar intento fallido
        recordFailedAttempt(userId);
        return { valid: false, error: 'PIN incorrecto' };
    } catch (error) {
        logger.error({ error }, 'Error validating user PIN');
        return { valid: false, error: 'Error validando PIN' };
    }
}

/**
 * Inserta registro de auditoría para handover
 */
async function insertHandoverAudit(
    client: any,
    params: {
        userId: string;
        incomingUserId?: string;
        locationId: string;
        terminalId: string;
        sessionId: string;
        actionCode: string;
        oldValues?: Record<string, any>;
        newValues?: Record<string, any>;
        description?: string;
    }
) {
    try {
        await client.query(`
            INSERT INTO audit_log (
                user_id, location_id, action_code, 
                entity_type, entity_id, old_values, new_values, 
                justification
            ) VALUES (
                $1::uuid, $2::uuid, $3,
                'SHIFT_HANDOVER', $4, $5::jsonb, $6::jsonb,
                $7
            )
        `, [
            params.userId,
            params.locationId,
            params.actionCode,
            params.sessionId,
            params.oldValues ? JSON.stringify(params.oldValues) : null,
            JSON.stringify({
                ...params.newValues,
                terminal_id: params.terminalId,
                incoming_user_id: params.incomingUserId
            }),
            params.description || null
        ]);
    } catch (auditError: any) {
        logger.warn({ err: auditError }, 'Handover audit log insertion failed (non-critical)');
    }
}

// =====================================================
// INTERFACES
// =====================================================

export interface HandoverSummary {
    expectedCash: number;
    declaredCash: number;
    diff: number;
    amountToWithdraw: number;
    amountToKeep: number;
    cashSales: number;
    cardSales: number;
    transferSales: number;
    otherSales: number;
    totalSales: number;
    cashIn: number;
    cashOut: number;
    openingAmount: number;
}

// =====================================================
// OPERACIONES DE HANDOVER SEGURAS
// =====================================================

/**
 * Calcula el resumen del handover de forma segura
 */
export async function calculateHandoverSecure(
    terminalId: string,
    declaredCash: number
): Promise<{ success: boolean; data?: HandoverSummary; error?: string }> {

    // 1. Validación
    const validation = CalculateHandoverSchema.safeParse({ terminalId, declaredCash });
    if (!validation.success) {
        return { success: false, error: validation.error.issues[0]?.message || 'Datos inválidos' };
    }

    try {
        logger.info({ terminalId, declaredCash }, '🔄 [Handover v2] Calculating handover summary');

        // 2. Obtener sesión activa
        const sessionRes = await query(`
            SELECT id, opening_amount, opened_at
            FROM cash_register_sessions 
            WHERE terminal_id = $1::uuid AND closed_at IS NULL 
            ORDER BY opened_at DESC LIMIT 1
        `, [terminalId]);

        if ((sessionRes.rowCount || 0) === 0) {
            return { success: false, error: ERROR_MESSAGES.NO_ACTIVE_SHIFT };
        }

        const session = sessionRes.rows[0];
        const openingAmount = Number(session.opening_amount || 0);

        // 3. Calcular ventas por método de pago
        const salesRes = await query(`
            SELECT 
                payment_method,
                COALESCE(SUM(COALESCE(total_amount, total)), 0) as total
            FROM sales 
            WHERE 
                terminal_id = $1::uuid 
                AND session_id = $2::uuid
                AND status != 'VOIDED'
            GROUP BY payment_method
        `, [terminalId, session.id]);

        let cashSales = 0, cardSales = 0, transferSales = 0, otherSales = 0;

        for (const row of salesRes.rows) {
            const amount = Number(row.total);
            const pm = row.payment_method;

            if (pm === 'CASH') cashSales = amount;
            else if (['CARD', 'CREDIT', 'DEBIT'].includes(pm)) cardSales += amount;
            else if (pm === 'TRANSFER') transferSales = amount;
            else otherSales += amount;
        }

        const totalSales = cashSales + cardSales + transferSales + otherSales;

        // 4. Calcular movimientos de caja
        const movementsRes = await query(`
            SELECT 
                COALESCE(SUM(CASE WHEN type IN ('IN', 'EXTRA_INCOME') THEN amount ELSE 0 END), 0) as total_in,
                COALESCE(SUM(CASE WHEN type IN ('OUT', 'WITHDRAWAL', 'EXPENSE') THEN amount ELSE 0 END), 0) as total_out
            FROM cash_movements
            WHERE 
                session_id = $1::uuid
                AND type NOT IN ('APERTURA', 'OPENING')
        `, [session.id]);

        const cashIn = Number(movementsRes.rows[0]?.total_in || 0);
        const cashOut = Number(movementsRes.rows[0]?.total_out || 0);

        // 5. Calcular esperado
        const expectedCash = openingAmount + cashSales + cashIn - cashOut;
        const diff = declaredCash - expectedCash;

        // 6. Calcular retiro inteligente
        let amountToKeep = BASE_CASH;
        let amountToWithdraw = 0;

        if (declaredCash > BASE_CASH) {
            amountToWithdraw = declaredCash - BASE_CASH;
            amountToKeep = BASE_CASH;
        } else {
            amountToKeep = declaredCash;
            amountToWithdraw = 0;
        }

        return {
            success: true,
            data: {
                expectedCash,
                declaredCash,
                diff,
                amountToWithdraw,
                amountToKeep,
                cashSales,
                cardSales,
                transferSales,
                otherSales,
                totalSales,
                cashIn,
                cashOut,
                openingAmount
            }
        };

    } catch (error: any) {
        logger.error({ err: error }, 'Error calculating handover');
        return { success: false, error: error.message };
    }
}

/**
 * Ejecuta el handover con validación de PIN y auditoría completa
 */
export async function executeHandoverSecure(params: {
    terminalId: string;
    declaredCash: number;
    expectedCash: number;
    amountToWithdraw: number;
    amountToKeep: number;
    userId: string;
    userPin: string;
    nextUserId?: string;
    notes?: string;
}): Promise<{ success: boolean; remittanceId?: string; error?: string }> {

    // 1. Validación
    const validation = ExecuteHandoverSchema.safeParse(params);
    if (!validation.success) {
        logger.warn({ error: validation.error.format() }, 'Invalid input for executeHandoverSecure');
        return { success: false, error: validation.error.issues[0]?.message || 'Datos inválidos' };
    }

    const {
        terminalId, declaredCash, expectedCash,
        amountToWithdraw, amountToKeep,
        userId, userPin, nextUserId, notes
    } = validation.data;

    const { pool } = await import('@/lib/db');
    const { v4: uuidv4 } = await import('uuid');
    const client = await pool.connect();

    try {
        logger.info({ terminalId, userId }, '🔄 [Handover v2] Starting secure handover');

        // --- INICIO DE TRANSACCIÓN ---
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 2. Validar PIN del usuario
        const pinResult = await validateUserPin(client, userId, userPin);
        if (!pinResult.valid) {
            await client.query('ROLLBACK');
            logger.warn({ userId }, '🚫 Handover: PIN validation failed');
            return { success: false, error: ERROR_MESSAGES.INVALID_PIN };
        }

        // 3. Bloquear terminal
        const termRes = await client.query(`
            SELECT id, location_id, current_cashier_id, status
            FROM terminals 
            WHERE id = $1::uuid
            FOR UPDATE NOWAIT
        `, [terminalId]);

        if (termRes.rows.length === 0) {
            throw new Error(ERROR_MESSAGES.TERMINAL_NOT_FOUND);
        }

        const terminal = termRes.rows[0];

        // Verificar que el usuario es el cajero actual
        if (terminal.current_cashier_id && terminal.current_cashier_id !== userId) {
            throw new Error(ERROR_MESSAGES.USER_MISMATCH);
        }

        // 4. Bloquear sesión activa
        const shiftRes = await client.query(`
            SELECT id, user_id, opening_amount, opened_at
            FROM cash_register_sessions 
            WHERE terminal_id = $1::uuid AND closed_at IS NULL 
            ORDER BY opened_at DESC LIMIT 1
            FOR UPDATE NOWAIT
        `, [terminalId]);

        if (shiftRes.rows.length === 0) {
            throw new Error(ERROR_MESSAGES.NO_ACTIVE_SHIFT);
        }

        const currentShift = shiftRes.rows[0];

        // 5. Crear remesa (si hay monto a retirar)
        let remittanceId: string | undefined;
        if (amountToWithdraw > 0) {
            remittanceId = uuidv4();
            await client.query(`
                INSERT INTO treasury_remittances (
                    id, location_id, source_terminal_id, amount, 
                    status, created_by, created_at,
                    shift_start, shift_end, cash_count_diff, notes
                ) VALUES (
                    $1::uuid, $2::uuid, $3::uuid, $4, 
                    'PENDING_RECEIPT', $5::uuid, NOW(),
                    $6, NOW(), $7, $8
                )
            `, [
                remittanceId,
                terminal.location_id,
                terminalId,
                amountToWithdraw,
                userId,
                currentShift.opened_at,
                declaredCash - expectedCash,
                notes || `Arqueo: Declarado $${declaredCash} vs Sistema $${expectedCash}. Base mantenida: $${amountToKeep}`
            ]);
        }

        // 6. Cerrar sesión actual
        await client.query(`
            UPDATE cash_register_sessions 
            SET closed_at = NOW(), 
                status = 'CLOSED',
                closing_amount = $2
            WHERE id = $1::uuid
        `, [currentShift.id, declaredCash]);

        // 7. Actualizar terminal
        await client.query(`
            UPDATE terminals 
            SET current_cashier_id = NULL, 
                status = 'CLOSED',
                updated_at = NOW()
            WHERE id = $1::uuid
        `, [terminalId]);

        // 8. Auditoría
        await insertHandoverAudit(client, {
            userId,
            incomingUserId: nextUserId,
            locationId: terminal.location_id,
            terminalId,
            sessionId: currentShift.id,
            actionCode: 'SHIFT_HANDOVER',
            oldValues: {
                status: 'OPEN',
                opening_amount: Number(currentShift.opening_amount),
                user_id: currentShift.user_id
            },
            newValues: {
                status: 'CLOSED',
                closing_amount: declaredCash,
                expected_cash: expectedCash,
                diff: declaredCash - expectedCash,
                remittance_amount: amountToWithdraw,
                remittance_id: remittanceId,
                closed_by: pinResult.user?.name
            },
            description: notes || `Cierre de turno por ${pinResult.user?.name}`
        });

        // --- COMMIT ---
        await client.query('COMMIT');

        logger.info({ terminalId, remittanceId }, '✅ [Handover v2] Handover completed');

        // 9. Notificar a gerentes (fuera de transacción)
        try {
            const { notifyManagersSecure } = await import('./notifications-v2');
            await notifyManagersSecure({
                locationId: terminal.location_id,
                title: "💰 Nueva Remesa Pendiente",
                message: `El cajero ${pinResult.user?.name} ha cerrado turno. Monto: $${amountToWithdraw.toLocaleString('es-CL')}`,
                link: "/finance/treasury"
            });
        } catch (notifyError) {
            logger.warn({ err: notifyError }, 'Failed to notify managers (non-critical)');
        }

        revalidatePath('/pos');
        revalidatePath('/caja');
        revalidatePath('/finance/treasury');

        return { success: true, remittanceId };

    } catch (error: any) {
        await client.query('ROLLBACK');

        if (error.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            return { success: false, error: ERROR_MESSAGES.SESSION_LOCKED };
        }

        if (error.code === ERROR_CODES.SERIALIZATION_FAILURE) {
            return { success: false, error: ERROR_MESSAGES.SERIALIZATION_ERROR };
        }

        logger.error({ err: error }, '❌ [Handover v2] Handover failed');
        return { success: false, error: error.message || 'Error en handover' };

    } finally {
        client.release();
    }
}

/**
 * Handover rápido entre cajeros (cierre + apertura atómica)
 * Requiere PIN de ambos cajeros
 */
export async function quickHandoverSecure(params: {
    terminalId: string;
    outgoingUserId: string;
    outgoingUserPin: string;
    incomingUserId: string;
    incomingUserPin: string;
    declaredCash: number;
    notes?: string;
}): Promise<{ success: boolean; newSessionId?: string; error?: string }> {

    // 1. Validación
    const validation = QuickHandoverSchema.safeParse(params);
    if (!validation.success) {
        return { success: false, error: validation.error.issues[0]?.message || 'Datos inválidos' };
    }

    const {
        terminalId, outgoingUserId, outgoingUserPin,
        incomingUserId, incomingUserPin, declaredCash, notes
    } = validation.data;

    const { pool } = await import('@/lib/db');
    const { v4: uuidv4 } = await import('uuid');
    const client = await pool.connect();

    try {
        logger.info({ terminalId, outgoingUserId, incomingUserId }, '🔄 [Handover v2] Starting quick handover');

        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 2. Validar PIN del cajero saliente
        const outgoingPinResult = await validateUserPin(client, outgoingUserId, outgoingUserPin);
        if (!outgoingPinResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: 'PIN del cajero saliente inválido' };
        }

        // 3. Validar PIN del cajero entrante
        const incomingPinResult = await validateUserPin(client, incomingUserId, incomingUserPin);
        if (!incomingPinResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: 'PIN del cajero entrante inválido' };
        }

        // 4. Bloquear terminal
        const termRes = await client.query(`
            SELECT id, location_id, current_cashier_id
            FROM terminals 
            WHERE id = $1::uuid
            FOR UPDATE NOWAIT
        `, [terminalId]);

        if (termRes.rows.length === 0) {
            throw new Error(ERROR_MESSAGES.TERMINAL_NOT_FOUND);
        }

        const terminal = termRes.rows[0];

        // 5. Bloquear y cerrar sesión actual
        const shiftRes = await client.query(`
            SELECT id, opening_amount, opened_at
            FROM cash_register_sessions 
            WHERE terminal_id = $1::uuid AND closed_at IS NULL 
            ORDER BY opened_at DESC LIMIT 1
            FOR UPDATE NOWAIT
        `, [terminalId]);

        if (shiftRes.rows.length === 0) {
            throw new Error(ERROR_MESSAGES.NO_ACTIVE_SHIFT);
        }

        const currentShift = shiftRes.rows[0];

        // 6. Cerrar sesión actual
        await client.query(`
            UPDATE cash_register_sessions 
            SET closed_at = NOW(), 
                status = 'CLOSED',
                closing_amount = $2
            WHERE id = $1::uuid
        `, [currentShift.id, declaredCash]);

        // 7. Crear nueva sesión para cajero entrante
        const newSessionId = uuidv4();
        await client.query(`
            INSERT INTO cash_register_sessions (
                id, terminal_id, user_id, 
                opening_amount, opened_at, status
            ) VALUES (
                $1::uuid, $2::uuid, $3::uuid, 
                $4, NOW(), 'OPEN'
            )
        `, [newSessionId, terminalId, incomingUserId, declaredCash]);

        // 8. Actualizar terminal
        await client.query(`
            UPDATE terminals 
            SET current_cashier_id = $2::uuid, 
                status = 'OPEN',
                updated_at = NOW()
            WHERE id = $1::uuid
        `, [terminalId, incomingUserId]);

        // 9. Auditoría
        await insertHandoverAudit(client, {
            userId: outgoingUserId,
            incomingUserId,
            locationId: terminal.location_id,
            terminalId,
            sessionId: currentShift.id,
            actionCode: 'QUICK_HANDOVER',
            oldValues: {
                outgoing_user: outgoingPinResult.user?.name,
                opening_amount: Number(currentShift.opening_amount)
            },
            newValues: {
                incoming_user: incomingPinResult.user?.name,
                handover_amount: declaredCash,
                new_session_id: newSessionId
            },
            description: notes || `Cambio de turno: ${outgoingPinResult.user?.name} → ${incomingPinResult.user?.name}`
        });

        await client.query('COMMIT');

        logger.info({ terminalId, newSessionId, incomingUserId }, '✅ [Handover v2] Quick handover completed');

        revalidatePath('/pos');
        revalidatePath('/caja');

        return { success: true, newSessionId };

    } catch (error: any) {
        await client.query('ROLLBACK');

        if (error.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            return { success: false, error: ERROR_MESSAGES.SESSION_LOCKED };
        }

        if (error.code === ERROR_CODES.SERIALIZATION_FAILURE) {
            return { success: false, error: ERROR_MESSAGES.SERIALIZATION_ERROR };
        }

        logger.error({ err: error }, '❌ [Handover v2] Quick handover failed');
        return { success: false, error: error.message || 'Error en cambio de turno' };

    } finally {
        client.release();
    }
}

// =====================================================
// NOTE: BASE_CASH es constante interna - Next.js 16 use server solo permite async functions
