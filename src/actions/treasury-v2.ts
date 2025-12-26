'use server';

/**
 * 🏦 TREASURY V2 - SECURE FINANCIAL OPERATIONS
 * Pharma-Synapse v3.1 - Farmacias Vallenar
 * 
 * Este módulo implementa operaciones financieras seguras con:
 * - Transacciones SERIALIZABLE para integridad
 * - Bloqueo pesimista (FOR UPDATE NOWAIT)
 * - Validación de PIN con bcrypt
 * - Control de acceso basado en roles (RBAC)
 * - Auditoría completa de operaciones
 * - Validación con Zod
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

const TransferFundsSchema = z.object({
    fromAccountId: UUIDSchema,
    toAccountId: UUIDSchema,
    amount: z.number().positive({ message: "El monto debe ser positivo" }),
    description: z.string().min(3, { message: "Descripción requerida (mínimo 3 caracteres)" }).max(500),
    userId: z.string().min(1, { message: "ID de usuario requerido" }),
    authorizationPin: z.string().min(4, { message: "PIN de autorización requerido" }).optional(),
});

const DepositToBankSchema = z.object({
    safeId: UUIDSchema,
    amount: z.number().positive({ message: "El monto debe ser positivo" }),
    userId: z.string().min(1),
    authorizationPin: z.string().min(4, { message: "PIN de autorización requerido" }),
    bankAccountId: UUIDSchema.optional(),
});

const ConfirmRemittanceSchema = z.object({
    remittanceId: UUIDSchema,
    managerId: z.string().min(1),
    managerPin: z.string().min(4, { message: "PIN de gerente requerido" }),
});

const CashMovementSchema = z.object({
    terminalId: UUIDSchema,
    sessionId: UUIDSchema,
    userId: z.string().min(1),
    type: z.enum(['WITHDRAWAL', 'EXTRA_INCOME', 'EXPENSE']),
    amount: z.number().positive({ message: "El monto debe ser positivo" }),
    reason: z.string().min(3, { message: "Motivo requerido" }).max(500),
    authorizationPin: z.string().min(4).optional(),
});

// =====================================================
// CONSTANTES
// =====================================================

const ERROR_CODES = {
    LOCK_NOT_AVAILABLE: '55P03',
    SERIALIZATION_FAILURE: '40001',
    DEADLOCK_DETECTED: '40P01'
} as const;

const ERROR_MESSAGES = {
    INSUFFICIENT_FUNDS: 'Fondos insuficientes',
    ACCOUNT_NOT_FOUND: 'Cuenta no encontrada',
    ACCOUNT_LOCKED: 'Cuenta bloqueada por otro proceso. Intente en unos segundos.',
    INVALID_PIN: 'PIN de autorización inválido',
    UNAUTHORIZED: 'No tiene permisos para esta operación',
    SERIALIZATION_ERROR: 'Conflicto de concurrencia. Por favor reintente.',
} as const;

// Roles que pueden autorizar operaciones financieras sensibles
const AUTHORIZED_ROLES = ['ADMIN', 'MANAGER', 'GERENTE_GENERAL', 'TESORERO'] as const;

// Montos que requieren autorización de gerente
const AUTHORIZATION_THRESHOLDS = {
    TRANSFER: 500000,      // Transferencias > $500,000
    DEPOSIT: 1000000,      // Depósitos bancarios > $1,000,000
    WITHDRAWAL: 100000,    // Retiros > $100,000
} as const;

// =====================================================
// HELPERS
// =====================================================

/**
 * Valida PIN de un usuario autorizado usando bcrypt
 */
async function validateAuthorizationPin(
    client: any,
    pin: string,
    requiredRoles: readonly string[] = AUTHORIZED_ROLES
): Promise<{ valid: boolean; authorizedBy?: { id: string; name: string; role: string }; error?: string }> {
    try {
        // Rate limiting import
        const { checkRateLimit, recordFailedAttempt, resetAttempts } = await import('@/lib/rate-limiter');
        const bcrypt = await import('bcryptjs');

        // Buscar usuarios con roles autorizados
        const usersRes = await client.query(`
            SELECT id, name, role, access_pin_hash, access_pin
            FROM users 
            WHERE role = ANY($1::text[])
            AND is_active = true
        `, [requiredRoles]);

        for (const user of usersRes.rows) {
            // Verificar rate limit ANTES de comparar PIN
            const rateCheck = checkRateLimit(user.id);
            if (!rateCheck.allowed) {
                logger.warn({
                    userId: user.id,
                    blockedUntil: rateCheck.blockedUntil
                }, '🚫 [Treasury] Usuario bloqueado por rate limit');

                return {
                    valid: false,
                    error: rateCheck.reason || 'Usuario temporalmente bloqueado'
                };
            }

            // Primero intentar con bcrypt hash
            if (user.access_pin_hash) {
                const isValid = await bcrypt.compare(pin, user.access_pin_hash);
                if (isValid) {
                    // PIN correcto - resetear intentos
                    resetAttempts(user.id);
                    return {
                        valid: true,
                        authorizedBy: { id: user.id, name: user.name, role: user.role }
                    };
                } else {
                    // PIN incorrecto - registrar intento fallido
                    recordFailedAttempt(user.id);
                }
            }
            // Fallback: PIN legacy (para usuarios no migrados)
            else if (user.access_pin && user.access_pin === pin) {
                logger.warn({ userId: user.id }, '⚠️ Treasury: Using legacy plaintext PIN - user should be migrated');
                resetAttempts(user.id);
                return {
                    valid: true,
                    authorizedBy: { id: user.id, name: user.name, role: user.role }
                };
            } else {
                // PIN incorrecto - registrar intento fallido
                recordFailedAttempt(user.id);
            }
        }

        return { valid: false, error: 'PIN de autorización inválido' };
    } catch (error) {
        logger.error({ error }, 'Error validating authorization PIN');
        return { valid: false, error: 'Error validando PIN' };
    }
}

/**
 * Inserta registro de auditoría para operaciones financieras
 */
async function insertFinancialAudit(
    client: any,
    params: {
        userId: string;
        authorizedById?: string;
        locationId?: string;
        actionCode: string;
        entityType: string;
        entityId: string;
        amount: number;
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
                $4, $5, $6::jsonb, $7::jsonb,
                $8
            )
        `, [
            params.userId || null,
            params.locationId || null,
            params.actionCode,
            params.entityType,
            params.entityId,
            params.oldValues ? JSON.stringify(params.oldValues) : null,
            JSON.stringify({
                ...params.newValues,
                amount: params.amount,
                authorized_by: params.authorizedById
            }),
            params.description || null
        ]);
    } catch (auditError: any) {
        // Log pero no fallar la transacción principal
        logger.warn({ err: auditError }, 'Financial audit log insertion failed (non-critical)');
    }
}

// =====================================================
// OPERACIONES FINANCIERAS SEGURAS
// =====================================================

/**
 * Transferencia de fondos entre cuentas con seguridad mejorada
 * 
 * @param params - Parámetros de la transferencia
 * @returns Resultado de la operación
 * 
 * @example
 * const result = await transferFundsSecure({
 *   fromAccountId: 'uuid-safe',
 *   toAccountId: 'uuid-bank',
 *   amount: 100000,
 *   description: 'Depósito bancario semanal',
 *   userId: 'uuid-user',
 *   authorizationPin: '1234' // Requerido si amount > threshold
 * });
 */
export async function transferFundsSecure(params: {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    description: string;
    userId: string;
    authorizationPin?: string;
}): Promise<{ success: boolean; transferId?: string; error?: string }> {

    // 1. Validación de entrada
    const validation = TransferFundsSchema.safeParse(params);
    if (!validation.success) {
        logger.warn({ error: validation.error.format() }, 'Invalid input for transferFundsSecure');
        return { success: false, error: validation.error.issues[0]?.message || 'Datos inválidos' };
    }

    const { fromAccountId, toAccountId, amount, description, userId, authorizationPin } = params;

    // 2. Verificar si requiere autorización
    const requiresAuthorization = amount > AUTHORIZATION_THRESHOLDS.TRANSFER;
    if (requiresAuthorization && !authorizationPin) {
        return { success: false, error: `Transferencias mayores a $${AUTHORIZATION_THRESHOLDS.TRANSFER.toLocaleString()} requieren autorización de gerente` };
    }

    const { pool } = await import('@/lib/db');
    const { v4: uuidv4 } = await import('uuid');
    const client = await pool.connect();

    try {
        logger.info({ fromAccountId, toAccountId, amount }, '🏦 [Treasury v2] Starting secure transfer');

        // --- INICIO DE TRANSACCIÓN ---
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 3. Validar autorización si es necesario
        let authorizedBy: { id: string; name: string; role: string } | undefined;
        if (requiresAuthorization && authorizationPin) {
            const authResult = await validateAuthorizationPin(client, authorizationPin);
            if (!authResult.valid) {
                await client.query('ROLLBACK');
                logger.warn({ userId, amount }, '🚫 Treasury transfer: PIN validation failed');
                return { success: false, error: ERROR_MESSAGES.INVALID_PIN };
            }
            authorizedBy = authResult.authorizedBy;
            logger.info({ authorizedById: authorizedBy?.id }, '✅ Transfer authorized by manager');
        }

        // 4. Bloquear cuentas con FOR UPDATE NOWAIT (orden consistente para evitar deadlocks)
        const [firstId, secondId] = fromAccountId < toAccountId
            ? [fromAccountId, toAccountId]
            : [toAccountId, fromAccountId];

        const accountsRes = await client.query(`
            SELECT id, name, type, balance, location_id, is_active
            FROM financial_accounts 
            WHERE id IN ($1, $2) 
            FOR UPDATE NOWAIT
        `, [firstId, secondId]);

        if (accountsRes.rows.length !== 2) {
            throw new Error(ERROR_MESSAGES.ACCOUNT_NOT_FOUND);
        }

        const sourceAccount = accountsRes.rows.find(a => a.id === fromAccountId);
        const destAccount = accountsRes.rows.find(a => a.id === toAccountId);

        if (!sourceAccount || !destAccount) {
            throw new Error(ERROR_MESSAGES.ACCOUNT_NOT_FOUND);
        }

        // 5. Verificar fondos suficientes
        if (Number(sourceAccount.balance) < amount) {
            throw new Error(`${ERROR_MESSAGES.INSUFFICIENT_FUNDS}. Disponible: $${Number(sourceAccount.balance).toLocaleString()}`);
        }

        // 6. Verificar que las cuentas estén activas
        if (!sourceAccount.is_active || !destAccount.is_active) {
            throw new Error('Una o ambas cuentas están inactivas');
        }

        // 7. Ejecutar transferencia
        const transferId = uuidv4();
        const transactionIdOut = uuidv4();
        const transactionIdIn = uuidv4();

        // Débito de cuenta origen
        await client.query(`
            UPDATE financial_accounts 
            SET balance = balance - $1, updated_at = NOW() 
            WHERE id = $2
        `, [amount, fromAccountId]);

        await client.query(`
            INSERT INTO treasury_transactions (
                id, account_id, amount, type, description, 
                related_entity_id, created_by, created_at
            ) VALUES ($1, $2, $3, 'OUT', $4, $5, $6, NOW())
        `, [transactionIdOut, fromAccountId, amount, description, transferId, userId]);

        // Crédito a cuenta destino
        await client.query(`
            UPDATE financial_accounts 
            SET balance = balance + $1, updated_at = NOW() 
            WHERE id = $2
        `, [amount, toAccountId]);

        await client.query(`
            INSERT INTO treasury_transactions (
                id, account_id, amount, type, description, 
                related_entity_id, created_by, created_at
            ) VALUES ($1, $2, $3, 'IN', $4, $5, $6, NOW())
        `, [transactionIdIn, toAccountId, amount, description, transferId, userId]);

        // 8. Registrar auditoría
        await insertFinancialAudit(client, {
            userId,
            authorizedById: authorizedBy?.id,
            locationId: sourceAccount.location_id,
            actionCode: 'TREASURY_TRANSFER',
            entityType: 'TRANSFER',
            entityId: transferId,
            amount,
            oldValues: {
                source_balance: Number(sourceAccount.balance),
                dest_balance: Number(destAccount.balance)
            },
            newValues: {
                source_balance: Number(sourceAccount.balance) - amount,
                dest_balance: Number(destAccount.balance) + amount,
                from_account: sourceAccount.name,
                to_account: destAccount.name
            },
            description
        });

        // --- COMMIT ---
        await client.query('COMMIT');

        logger.info({ transferId, amount }, '✅ [Treasury v2] Transfer completed successfully');
        revalidatePath('/finance/treasury');

        return { success: true, transferId };

    } catch (error: any) {
        await client.query('ROLLBACK');

        if (error.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            logger.warn({ fromAccountId }, '⏳ [Treasury v2] Account locked by another process');
            return { success: false, error: ERROR_MESSAGES.ACCOUNT_LOCKED };
        }

        if (error.code === ERROR_CODES.SERIALIZATION_FAILURE) {
            logger.warn({ fromAccountId }, '🔄 [Treasury v2] Serialization conflict');
            return { success: false, error: ERROR_MESSAGES.SERIALIZATION_ERROR };
        }

        logger.error({ err: error }, '❌ [Treasury v2] Transfer failed');
        return { success: false, error: error.message || 'Error procesando transferencia' };

    } finally {
        client.release();
    }
}

/**
 * Depósito a banco desde caja fuerte con autorización
 */
export async function depositToBankSecure(params: {
    safeId: string;
    amount: number;
    userId: string;
    authorizationPin: string;
    bankAccountId?: string;
}): Promise<{ success: boolean; depositId?: string; error?: string }> {

    // 1. Validación
    const validation = DepositToBankSchema.safeParse(params);
    if (!validation.success) {
        return { success: false, error: validation.error.issues[0]?.message || 'Datos inválidos' };
    }

    const { safeId, amount, userId, authorizationPin, bankAccountId } = params;

    const { pool } = await import('@/lib/db');
    const { v4: uuidv4 } = await import('uuid');
    const client = await pool.connect();

    try {
        logger.info({ safeId, amount }, '🏦 [Treasury v2] Starting bank deposit');

        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 2. Validar autorización (siempre requerida para depósitos bancarios)
        const authResult = await validateAuthorizationPin(client, authorizationPin);
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: ERROR_MESSAGES.INVALID_PIN };
        }

        logger.info({ authorizedById: authResult.authorizedBy?.id }, '✅ Bank deposit authorized');

        // 3. Bloquear y verificar caja fuerte
        const safeRes = await client.query(`
            SELECT id, name, balance, location_id, type
            FROM financial_accounts 
            WHERE id = $1 AND type = 'SAFE'
            FOR UPDATE NOWAIT
        `, [safeId]);

        if (safeRes.rows.length === 0) {
            throw new Error('Caja fuerte no encontrada');
        }

        const safe = safeRes.rows[0];
        if (Number(safe.balance) < amount) {
            throw new Error(`${ERROR_MESSAGES.INSUFFICIENT_FUNDS}. Disponible: $${Number(safe.balance).toLocaleString()}`);
        }

        // 4. Encontrar o crear cuenta bancaria
        let bankId = bankAccountId;
        if (!bankId) {
            const bankRes = await client.query(`
                SELECT id FROM financial_accounts 
                WHERE location_id = $1 AND type = 'BANK'
                FOR UPDATE NOWAIT
            `, [safe.location_id]);

            if (bankRes.rows.length === 0) {
                // Crear cuenta bancaria si no existe
                bankId = uuidv4();
                await client.query(`
                    INSERT INTO financial_accounts (id, location_id, name, type, balance, is_active)
                    VALUES ($1, $2, 'Cuenta Banco', 'BANK', 0, true)
                `, [bankId, safe.location_id]);
            } else {
                bankId = bankRes.rows[0].id;
            }
        }

        // 5. Ejecutar depósito
        const depositId = uuidv4();

        // Débito de caja fuerte
        await client.query(`
            UPDATE financial_accounts 
            SET balance = balance - $1, updated_at = NOW() 
            WHERE id = $2
        `, [amount, safeId]);

        await client.query(`
            INSERT INTO treasury_transactions (
                id, account_id, amount, type, description, 
                related_entity_id, created_by, created_at
            ) VALUES ($1, $2, $3, 'OUT', 'Depósito Bancario', $4, $5, NOW())
        `, [uuidv4(), safeId, amount, depositId, userId]);

        // Crédito a banco
        await client.query(`
            UPDATE financial_accounts 
            SET balance = balance + $1, updated_at = NOW() 
            WHERE id = $2
        `, [amount, bankId]);

        await client.query(`
            INSERT INTO treasury_transactions (
                id, account_id, amount, type, description, 
                related_entity_id, created_by, created_at
            ) VALUES ($1, $2, $3, 'IN', 'Depósito desde Caja Fuerte', $4, $5, NOW())
        `, [uuidv4(), bankId, amount, depositId, userId]);

        // 6. Auditoría
        await insertFinancialAudit(client, {
            userId,
            authorizedById: authResult.authorizedBy?.id,
            locationId: safe.location_id,
            actionCode: 'BANK_DEPOSIT',
            entityType: 'DEPOSIT',
            entityId: depositId,
            amount,
            oldValues: { safe_balance: Number(safe.balance) },
            newValues: { safe_balance: Number(safe.balance) - amount },
            description: `Depósito bancario autorizado por ${authResult.authorizedBy?.name}`
        });

        await client.query('COMMIT');

        logger.info({ depositId, amount }, '✅ [Treasury v2] Bank deposit completed');
        revalidatePath('/finance/treasury');

        return { success: true, depositId };

    } catch (error: any) {
        await client.query('ROLLBACK');

        if (error.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            return { success: false, error: ERROR_MESSAGES.ACCOUNT_LOCKED };
        }

        logger.error({ err: error }, '❌ [Treasury v2] Bank deposit failed');
        return { success: false, error: error.message || 'Error procesando depósito' };

    } finally {
        client.release();
    }
}

/**
 * Confirmar recepción de remesa con validación de gerente
 */
export async function confirmRemittanceSecure(params: {
    remittanceId: string;
    managerId: string;
    managerPin: string;
}): Promise<{ success: boolean; error?: string }> {

    // 1. Validación
    const validation = ConfirmRemittanceSchema.safeParse(params);
    if (!validation.success) {
        return { success: false, error: validation.error.issues[0]?.message || 'Datos inválidos' };
    }

    const { remittanceId, managerId, managerPin } = params;

    const { pool } = await import('@/lib/db');
    const { v4: uuidv4 } = await import('uuid');
    const client = await pool.connect();

    try {
        logger.info({ remittanceId }, '🏦 [Treasury v2] Confirming remittance');

        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 2. Validar PIN de gerente
        const authResult = await validateAuthorizationPin(client, managerPin, ['MANAGER', 'ADMIN', 'GERENTE_GENERAL']);
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: ERROR_MESSAGES.INVALID_PIN };
        }

        // Verificar que el managerId coincide con el autorizado
        if (authResult.authorizedBy?.id !== managerId) {
            await client.query('ROLLBACK');
            return { success: false, error: 'El PIN no corresponde al usuario' };
        }

        // 3. Bloquear y verificar remesa
        const remRes = await client.query(`
            SELECT * FROM treasury_remittances 
            WHERE id = $1 
            FOR UPDATE NOWAIT
        `, [remittanceId]);

        if (remRes.rows.length === 0) {
            throw new Error('Remesa no encontrada');
        }

        const remittance = remRes.rows[0];
        if (remittance.status !== 'PENDING_RECEIPT') {
            throw new Error('Esta remesa ya fue procesada');
        }

        // 4. Encontrar caja fuerte
        const safeRes = await client.query(`
            SELECT id, balance FROM financial_accounts 
            WHERE location_id = $1 AND type = 'SAFE'
            FOR UPDATE NOWAIT
        `, [remittance.location_id]);

        if (safeRes.rows.length === 0) {
            throw new Error('Caja fuerte no encontrada para esta sucursal');
        }

        const safe = safeRes.rows[0];

        // 5. Ejecutar confirmación
        // Ingresar a caja fuerte
        await client.query(`
            UPDATE financial_accounts 
            SET balance = balance + $1, updated_at = NOW() 
            WHERE id = $2
        `, [remittance.amount, safe.id]);

        await client.query(`
            INSERT INTO treasury_transactions (
                id, account_id, amount, type, description, 
                related_entity_id, created_by, created_at
            ) VALUES ($1, $2, $3, 'IN', 'Ingreso por Remesa', $4, $5, NOW())
        `, [uuidv4(), safe.id, remittance.amount, remittanceId, managerId]);

        // Actualizar estado de remesa
        await client.query(`
            UPDATE treasury_remittances 
            SET status = 'RECEIVED', 
                received_by = $1, 
                updated_at = NOW() 
            WHERE id = $2
        `, [managerId, remittanceId]);

        // 6. Auditoría
        await insertFinancialAudit(client, {
            userId: managerId,
            authorizedById: authResult.authorizedBy?.id,
            locationId: remittance.location_id,
            actionCode: 'REMITTANCE_CONFIRMED',
            entityType: 'REMITTANCE',
            entityId: remittanceId,
            amount: Number(remittance.amount),
            oldValues: { status: 'PENDING_RECEIPT', safe_balance: Number(safe.balance) },
            newValues: {
                status: 'RECEIVED',
                safe_balance: Number(safe.balance) + Number(remittance.amount),
                confirmed_by: authResult.authorizedBy?.name
            },
            description: `Remesa confirmada por ${authResult.authorizedBy?.name}`
        });

        await client.query('COMMIT');

        logger.info({ remittanceId, amount: remittance.amount }, '✅ [Treasury v2] Remittance confirmed');
        revalidatePath('/finance/treasury');

        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');

        if (error.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            return { success: false, error: 'Remesa bloqueada por otro proceso. Intente en unos segundos.' };
        }

        logger.error({ err: error }, '❌ [Treasury v2] Remittance confirmation failed');
        return { success: false, error: error.message || 'Error confirmando remesa' };

    } finally {
        client.release();
    }
}

/**
 * Crear movimiento de caja (retiro/ingreso extra) con autorización
 */
export async function createCashMovementSecure(params: {
    terminalId: string;
    sessionId: string;
    userId: string;
    type: 'WITHDRAWAL' | 'EXTRA_INCOME' | 'EXPENSE';
    amount: number;
    reason: string;
    authorizationPin?: string;
}): Promise<{ success: boolean; movementId?: string; error?: string }> {

    // 1. Validación
    const validation = CashMovementSchema.safeParse(params);
    if (!validation.success) {
        return { success: false, error: validation.error.issues[0]?.message || 'Datos inválidos' };
    }

    const { terminalId, sessionId, userId, type, amount, reason, authorizationPin } = params;

    // 2. Verificar si requiere autorización (retiros > threshold)
    const requiresAuthorization = type === 'WITHDRAWAL' && amount > AUTHORIZATION_THRESHOLDS.WITHDRAWAL;
    if (requiresAuthorization && !authorizationPin) {
        return {
            success: false,
            error: `Retiros mayores a $${AUTHORIZATION_THRESHOLDS.WITHDRAWAL.toLocaleString()} requieren autorización de gerente`
        };
    }

    const { pool } = await import('@/lib/db');
    const { v4: uuidv4 } = await import('uuid');
    const client = await pool.connect();

    try {
        logger.info({ terminalId, type, amount }, '🏦 [Treasury v2] Creating cash movement');

        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 3. Validar autorización si es necesario
        let authorizedBy: { id: string; name: string; role: string } | undefined;
        if (requiresAuthorization && authorizationPin) {
            const authResult = await validateAuthorizationPin(client, authorizationPin);
            if (!authResult.valid) {
                await client.query('ROLLBACK');
                return { success: false, error: ERROR_MESSAGES.INVALID_PIN };
            }
            authorizedBy = authResult.authorizedBy;
        }

        // 4. Verificar sesión activa
        const sessionRes = await client.query(`
            SELECT id, terminal_id, user_id 
            FROM cash_register_sessions 
            WHERE id = $1 AND terminal_id = $2 AND closed_at IS NULL
            FOR UPDATE NOWAIT
        `, [sessionId, terminalId]);

        if (sessionRes.rows.length === 0) {
            throw new Error('No hay sesión activa para este terminal');
        }

        // 5. Crear movimiento
        const movementId = uuidv4();

        await client.query(`
            INSERT INTO cash_movements (
                id, location_id, terminal_id, session_id, user_id,
                type, amount, reason, is_cash, timestamp, authorized_by
            ) VALUES (
                $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
                $6, $7, $8, true, NOW(), $9::uuid
            )
        `, [
            movementId,
            sessionId, // location_id holds session_id per legacy schema
            terminalId,
            sessionId,
            userId,
            type,
            amount,
            reason,
            authorizedBy?.id || null
        ]);

        // 6. Auditoría
        await insertFinancialAudit(client, {
            userId,
            authorizedById: authorizedBy?.id,
            actionCode: `CASH_${type}`,
            entityType: 'CASH_MOVEMENT',
            entityId: movementId,
            amount,
            newValues: {
                type,
                reason,
                terminal_id: terminalId,
                authorized_by: authorizedBy?.name
            },
            description: reason
        });

        await client.query('COMMIT');

        logger.info({ movementId, type, amount }, '✅ [Treasury v2] Cash movement created');
        revalidatePath('/caja');

        return { success: true, movementId };

    } catch (error: any) {
        await client.query('ROLLBACK');

        if (error.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            return { success: false, error: 'Sesión bloqueada por otro proceso. Intente en unos segundos.' };
        }

        logger.error({ err: error }, '❌ [Treasury v2] Cash movement creation failed');
        return { success: false, error: error.message || 'Error creando movimiento de caja' };

    } finally {
        client.release();
    }
}

// =====================================================
// CONSULTAS SEGURAS
// =====================================================

/**
 * Obtiene el historial de transacciones de una cuenta con paginación
 */
export async function getTransactionHistory(
    accountId: string,
    options: { limit?: number; offset?: number; startDate?: Date; endDate?: Date } = {}
): Promise<{ success: boolean; data?: any[]; total?: number; error?: string }> {

    if (!z.string().uuid().safeParse(accountId).success) {
        return { success: false, error: 'ID de cuenta inválido' };
    }

    const { limit = 50, offset = 0, startDate, endDate } = options;

    try {
        let whereClause = 'WHERE account_id = $1';
        const params: any[] = [accountId];

        if (startDate) {
            params.push(startDate);
            whereClause += ` AND created_at >= $${params.length}`;
        }

        if (endDate) {
            params.push(endDate);
            whereClause += ` AND created_at <= $${params.length}`;
        }

        // Obtener total
        const countRes = await query(
            `SELECT COUNT(*) FROM treasury_transactions ${whereClause}`,
            params
        );
        const total = parseInt(countRes.rows[0].count, 10);

        // Obtener transacciones
        params.push(limit, offset);
        const dataRes = await query(`
            SELECT 
                t.*,
                u.name as created_by_name
            FROM treasury_transactions t
            LEFT JOIN users u ON t.created_by = u.id
            ${whereClause}
            ORDER BY t.created_at DESC
            LIMIT $${params.length - 1} OFFSET $${params.length}
        `, params);

        return { success: true, data: dataRes.rows, total };

    } catch (error: any) {
        logger.error({ err: error, accountId }, 'Error fetching transaction history');
        return { success: false, error: 'Error obteniendo historial de transacciones' };
    }
}

/**
 * Obtiene resumen financiero de una sucursal
 */
export async function getFinancialSummary(locationId: string): Promise<{
    success: boolean;
    data?: {
        accounts: any[];
        pendingRemittances: number;
        todayMovements: number;
        monthlyTotal: number;
    };
    error?: string;
}> {
    if (!z.string().uuid().safeParse(locationId).success) {
        return { success: false, error: 'ID de sucursal inválido' };
    }

    try {
        // Obtener cuentas
        const accountsRes = await query(`
            SELECT * FROM financial_accounts 
            WHERE location_id = $1 AND is_active = true
            ORDER BY type
        `, [locationId]);

        // Contar remesas pendientes
        const remittancesRes = await query(`
            SELECT COUNT(*) FROM treasury_remittances 
            WHERE location_id = $1 AND status = 'PENDING_RECEIPT'
        `, [locationId]);

        // Movimientos de hoy
        const todayRes = await query(`
            SELECT COALESCE(SUM(CASE WHEN type = 'IN' THEN amount ELSE -amount END), 0) as today_total
            FROM treasury_transactions 
            WHERE account_id IN (SELECT id FROM financial_accounts WHERE location_id = $1)
            AND created_at >= CURRENT_DATE
        `, [locationId]);

        // Total del mes
        const monthRes = await query(`
            SELECT COALESCE(SUM(CASE WHEN type = 'IN' THEN amount ELSE -amount END), 0) as monthly_total
            FROM treasury_transactions 
            WHERE account_id IN (SELECT id FROM financial_accounts WHERE location_id = $1)
            AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
        `, [locationId]);

        return {
            success: true,
            data: {
                accounts: accountsRes.rows,
                pendingRemittances: parseInt(remittancesRes.rows[0].count, 10),
                todayMovements: Number(todayRes.rows[0].today_total),
                monthlyTotal: Number(monthRes.rows[0].monthly_total)
            }
        };

    } catch (error: any) {
        logger.error({ err: error, locationId }, 'Error fetching financial summary');
        return { success: false, error: 'Error obteniendo resumen financiero' };
    }
}

// =====================================================
// REMITTANCE HISTORY SEGURO
// =====================================================

/**
 * Interface para items del historial de remesas
 */
export interface RemittanceHistoryItem {
    id: string;
    location_id: string;
    location_name: string;
    terminal_id: string;
    terminal_name: string;
    cashier_name: string;
    amount: number;
    cash_count_diff: number;
    status: 'PENDING' | 'RECEIVED' | 'DEPOSITED';
    receiver_name?: string;
    notes?: string;
    created_at: string;
}

/**
 * 📜 Obtiene historial de remesas con RBAC
 */
export async function getRemittanceHistorySecure(
    params?: { startDate?: string; endDate?: string; locationId?: string }
): Promise<{ success: boolean; data?: RemittanceHistoryItem[]; error?: string }> {
    const { headers } = await import('next/headers');
    const headersList = await headers();
    const userId = headersList.get('x-user-id');
    const userRole = headersList.get('x-user-role');

    if (!userId) {
        return { success: false, error: 'No autenticado' };
    }

    // RBAC: MANAGER_ROLES
    const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'QF'];
    if (!MANAGER_ROLES.includes(userRole || '')) {
        return { success: false, error: 'Acceso denegado' };
    }

    try {
        let sql = `
            SELECT 
                r.id, r.location_id, l.name as location_name,
                r.terminal_id, t.name as terminal_name,
                u.name as cashier_name,
                r.amount, r.cash_count_diff, r.status,
                rec.name as receiver_name, r.notes, r.created_at
            FROM remittances r
            JOIN locations l ON r.location_id = l.id
            LEFT JOIN terminals t ON r.terminal_id = t.id
            LEFT JOIN users u ON r.cashier_id = u.id
            LEFT JOIN users rec ON r.received_by = rec.id
            WHERE 1=1
        `;
        const sqlParams: any[] = [];

        if (params?.locationId) {
            sqlParams.push(params.locationId);
            sql += ` AND r.location_id = $${sqlParams.length}`;
        }

        if (params?.startDate) {
            sqlParams.push(params.startDate);
            sql += ` AND r.created_at >= $${sqlParams.length}::timestamp`;
        }

        if (params?.endDate) {
            sqlParams.push(params.endDate);
            sql += ` AND r.created_at <= $${sqlParams.length}::timestamp`;
        }

        sql += ` ORDER BY r.created_at DESC LIMIT 100`;

        const result = await query(sql, sqlParams);

        // Auditar acceso
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'REMITTANCE_HISTORY_VIEWED', 'TREASURY', $2::jsonb, NOW())
        `, [userId, JSON.stringify({ params, count: result.rows.length })]);

        return { success: true, data: result.rows };

    } catch (error: any) {
        logger.error({ error }, '[Treasury] getRemittanceHistorySecure error');
        return { success: false, error: 'Error obteniendo historial de remesas' };
    }
}

// =====================================================
// EXPORTS
// =====================================================

export {
    AUTHORIZATION_THRESHOLDS,
    AUTHORIZED_ROLES
};
