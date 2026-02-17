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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DBRow = any;

// =====================================================
// TIPOS EXPORTADOS (compatibles con treasury legacy)
// =====================================================

export interface FinancialAccount {
    id: string;
    location_id: string;
    name: string;
    type: 'SAFE' | 'BANK' | 'PETTY_CASH' | 'EQUITY';
    balance: number;
    is_active: boolean;
}

export interface TreasuryTransaction {
    id: string;
    account_id: string;
    amount: number;
    type: 'IN' | 'OUT';
    description: string;
    created_at: Date;
    created_by?: string;
}

export interface Remittance {
    id: string;
    location_id: string;
    source_terminal_id: string;
    amount: number;
    status: 'PENDING_RECEIPT' | 'RECEIVED';
    created_at: Date;
    created_by: string;
    received_by?: string;
}

// =====================================================
// SCHEMAS DE VALIDACIÓN
// =====================================================

const UUIDSchema = z.string().uuid({ message: "ID inválido" });

const TransferFundsSchema = z.object({
    fromAccountId: UUIDSchema,
    toAccountId: UUIDSchema,
    amount: z.number().positive({ message: "El monto debe ser positivo" }),
    description: z.string().min(3, { message: "Descripción requerida (mínimo 3 caracteres)" }).max(500),
    authorizationPin: z.string().min(4, { message: "PIN de autorización requerido" }).optional(),
});

const DepositToBankSchema = z.object({
    safeId: UUIDSchema,
    amount: z.number().positive({ message: "El monto debe ser positivo" }),
    authorizationPin: z.string().min(4, { message: "PIN de autorización requerido" }),
    bankAccountId: UUIDSchema.optional(),
});

const ConfirmRemittanceSchema = z.object({
    remittanceId: UUIDSchema,
    managerPin: z.string().min(4, { message: "PIN de gerente requerido" }),
});

const CashMovementSchema = z.object({
    terminalId: UUIDSchema,
    sessionId: UUIDSchema,
    type: z.enum(['WITHDRAWAL', 'EXTRA_INCOME', 'EXPENSE']),
    amount: z.number().positive({ message: "El monto debe ser positivo" }),
    reason: z.string().min(3, { message: "Motivo requerido" }).max(500),
    authorizationPin: z.string().min(4).optional(),
});

// =====================================================
// TIPOS EXPORTADOS (para frontend)
// =====================================================

export interface FinancialAccount {
    id: string;
    location_id: string;
    name: string;
    type: 'SAFE' | 'BANK' | 'PETTY_CASH' | 'EQUITY';
    balance: number;
    is_active: boolean;
}

export interface TreasuryTransaction {
    id: string;
    account_id: string;
    amount: number;
    type: 'IN' | 'OUT';
    description: string;
    created_at: Date;
    created_by?: string;
}

export interface Remittance {
    id: string;
    location_id: string;
    source_terminal_id: string;
    amount: number;
    status: 'PENDING_RECEIPT' | 'RECEIVED';
    created_at: Date;
    created_by: string;
    received_by?: string;
}

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

// Roles con acceso a todas las ubicaciones
const MANAGER_ROLES = ['ADMIN', 'MANAGER', 'GERENTE_GENERAL', 'QF'] as const;

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
 * Helper para obtener sesión del usuario actual
 * @returns Datos de sesión o null si no autenticado
 */
async function getSession(): Promise<{ userId: string; role: string; locationId?: string } | null> {
    try {
        // Importación dinámica para evitar problemas de ciclos
        const { cookies } = await import('next/headers');
        const cookieStore = await cookies();
        const sessionToken = cookieStore.get('session_token')?.value;

        if (!sessionToken) return null;

        // Buscar sesión activa en DB
        const res = await query(
            `SELECT u.id as "userId", u.role, u.assigned_location_id as "locationId"
             FROM sessions s
             JOIN users u ON s.user_id = u.id
             WHERE s.token = $1 AND s.expires_at > NOW()`,
            [sessionToken]
        );

        if (res.rows.length === 0) return null;
        return res.rows[0];
    } catch (error) {
        logger.error({ error }, '[Treasury] getSession error');
        return null;
    }
}

/**
 * Helper para obtener sesión segura (reemplaza getSession interno)
 */
async function getFullSessionSecure() {
    const { getSessionSecure } = await import('@/actions/auth-v2');
    return await getSessionSecure();
}

/**
 * Valida PIN de un usuario autorizado usando bcrypt
 */
async function validateAuthorizationPin(
    client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: DBRow[] }> },
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
    } catch (error: unknown) {
        logger.error({ error }, 'Error validating authorization PIN');
        return { valid: false, error: 'Error validando PIN' };
    }
}

/**
 * Inserta registro de auditoría para operaciones financieras
 */
async function insertFinancialAudit(
    client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
    params: {
        userId: string;
        authorizedById?: string;
        locationId?: string;
        actionCode: string;
        entityType: string;
        entityId: string;
        amount: number;
        oldValues?: Record<string, unknown>;
        newValues?: Record<string, unknown>;
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
    } catch (auditError: unknown) {
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
    authorizationPin?: string;
}): Promise<{ success: boolean; transferId?: string; error?: string }> {

    // 0. Obtener sesión segura
    const session = await getFullSessionSecure();
    if (!session || !session.userId) {
        return { success: false, error: 'No autenticado' };
    }
    const userId = session.userId;

    // 1. Validación de entrada

    const validation = TransferFundsSchema.safeParse(params);
    if (!validation.success) {
        logger.warn({ error: validation.error.format() }, 'Invalid input for transferFundsSecure');
        return { success: false, error: validation.error.issues[0]?.message || 'Datos inválidos' };
    }

    const { fromAccountId, toAccountId, amount, description, authorizationPin } = params;

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

    } catch (error: unknown) {
        await client.query('ROLLBACK');

        const err = error as { code?: string; message?: string };

        if (err.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            logger.warn({ fromAccountId }, '⏳ [Treasury v2] Account locked by another process');
            return { success: false, error: ERROR_MESSAGES.ACCOUNT_LOCKED };
        }

        if (err.code === ERROR_CODES.SERIALIZATION_FAILURE) {
            logger.warn({ fromAccountId }, '🔄 [Treasury v2] Serialization conflict');
            return { success: false, error: ERROR_MESSAGES.SERIALIZATION_ERROR };
        }

        logger.error({ err: error }, '❌ [Treasury v2] Transfer failed');
        return { success: false, error: err.message || 'Error procesando transferencia' };

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
    authorizationPin: string;

    bankAccountId?: string;
}): Promise<{ success: boolean; depositId?: string; error?: string }> {

    // 1. Validación
    const validation = DepositToBankSchema.safeParse(params);
    if (!validation.success) {
        return { success: false, error: validation.error.issues[0]?.message || 'Datos inválidos' };
    }

    const { safeId, amount, authorizationPin, bankAccountId } = params;

    // 1b. Obtener sesión segura
    const session = await getFullSessionSecure();
    if (!session || !session.userId) {
        return { success: false, error: 'No autenticado' };
    }
    const userId = session.userId;

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

    } catch (error: unknown) {
        await client.query('ROLLBACK');

        const err = error as { code?: string; message?: string };

        if (err.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            return { success: false, error: ERROR_MESSAGES.ACCOUNT_LOCKED };
        }

        logger.error({ err: error }, '❌ [Treasury v2] Bank deposit failed');
        return { success: false, error: err.message || 'Error procesando depósito' };

    } finally {
        client.release();
    }
}

/**
 * Confirmar recepción de remesa con validación de gerente
 */
export async function confirmRemittanceSecure(params: {
    remittanceId: string;
    managerPin: string;
}): Promise<{ success: boolean; error?: string }> {

    // 1. Validación
    const validation = ConfirmRemittanceSchema.safeParse(params);
    if (!validation.success) {
        return { success: false, error: validation.error.issues[0]?.message || 'Datos inválidos' };
    }

    const { remittanceId, managerPin } = params;

    const session = await getFullSessionSecure();
    if (!session || !session.userId) {
        return { success: false, error: 'No autenticado' };
    }
    const managerId = session.userId;

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

    } catch (error: unknown) {
        await client.query('ROLLBACK');

        const err = error as { code?: string; message?: string };

        if (err.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            return { success: false, error: 'Remesa bloqueada por otro proceso. Intente en unos segundos.' };
        }

        logger.error({ err: error }, '❌ [Treasury v2] Remittance confirmation failed');
        return { success: false, error: err.message || 'Error confirmando remesa' };

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
    type: 'WITHDRAWAL' | 'EXTRA_INCOME' | 'EXPENSE';
    amount: number;
    reason: string;
    authorizationPin?: string;
}): Promise<{ success: boolean; movementId?: string; error?: string }> {

    // 0. Obtener sesión segurate
    const session = await getFullSessionSecure();
    if (!session || !session.userId) {
        return { success: false, error: 'No autenticado' };
    }
    const userId = session.userId;

    // 1. Validación
    const validation = CashMovementSchema.safeParse(params);
    if (!validation.success) {
        return { success: false, error: validation.error.issues[0]?.message || 'Datos inválidos' };
    }

    const { terminalId, sessionId, type, amount, reason, authorizationPin } = params;

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
            SELECT s.id, s.terminal_id, s.user_id, t.location_id
            FROM cash_register_sessions s
            JOIN terminals t ON s.terminal_id = t.id
            WHERE s.id = $1 AND s.terminal_id = $2 AND s.closed_at IS NULL
            FOR UPDATE NOWAIT
        `, [sessionId, terminalId]);

        if (sessionRes.rows.length === 0) {
            throw new Error('No hay sesión activa para este terminal');
        }

        const activeSession = sessionRes.rows[0];

        // 5. Crear movimiento
        const movementId = uuidv4();

        await client.query(`
            INSERT INTO cash_movements (
                id, location_id, terminal_id, session_id, user_id,
                type, amount, reason, timestamp
            ) VALUES (
                $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
                $6, $7, $8, NOW()
            )
        `, [
            movementId,
            activeSession.location_id, // Fixed: Use actual location_id from session

            terminalId,
            sessionId,
            userId,
            type,
            amount,
            reason
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
        revalidatePath('/pos');

        return { success: true, movementId };

    } catch (error: unknown) {
        await client.query('ROLLBACK');

        const err = error as { code?: string; message?: string };

        if (err.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            return { success: false, error: 'Sesión bloqueada por otro proceso. Intente en unos segundos.' };
        }

        logger.error({ err: error }, '❌ [Treasury v2] Cash movement creation failed');
        return { success: false, error: err.message || 'Error creando movimiento de caja' };

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
): Promise<{ success: boolean; data?: TreasuryTransaction[]; total?: number; error?: string }> {

    if (!z.string().uuid().safeParse(accountId).success) {
        return { success: false, error: 'ID de cuenta inválido' };
    }

    const { limit = 50, offset = 0, startDate, endDate } = options;

    try {
        let whereClause = 'WHERE account_id = $1';
        const params: unknown[] = [accountId];

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

        return { success: true, data: dataRes.rows as TreasuryTransaction[], total };

    } catch (error: unknown) {
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
        accounts: FinancialAccount[];
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
                accounts: accountsRes.rows as FinancialAccount[],
                pendingRemittances: parseInt(remittancesRes.rows[0].count, 10),
                todayMovements: Number(todayRes.rows[0].today_total),
                monthlyTotal: Number(monthRes.rows[0].monthly_total)
            }
        };

    } catch (error: unknown) {
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

    // 1. Autenticación segura
    const session = await getFullSessionSecure();
    if (!session || !session.userId) {
        return { success: false, error: 'No autenticado' };
    }
    const { userId, role: userRole } = session;

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
            FROM treasury_remittances r
            JOIN locations l ON r.location_id = l.id
            LEFT JOIN terminals t ON r.terminal_id = t.id
            LEFT JOIN users u ON r.cashier_id = u.id
            LEFT JOIN users rec ON r.received_by = rec.id
            WHERE 1=1
        `;
        const sqlParams: unknown[] = [];

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

    } catch (error: unknown) {
        logger.error({ error }, '[Treasury] getRemittanceHistorySecure error');
        return { success: false, error: 'Error obteniendo historial de remesas' };
    }
}

// =====================================================
// CONSULTAS SEGURAS ADICIONALES
// =====================================================

/**
 * 💰 Obtiene cuentas financieras de una sucursal con RBAC
 */
export async function getFinancialAccountsSecure(
    locationId: string
): Promise<{ success: boolean; data?: FinancialAccount[]; error?: string }> {
    try {
        // Validación de sesión
        const session = await getSession();
        if (!session) {
            return { success: false, error: 'No autorizado' };
        }

        // RBAC: Solo gerentes pueden ver todas las ubicaciones
        // Cajeros/vendedores solo ven su ubicación
        const effectiveLocationId = MANAGER_ROLES.includes(session.role as typeof MANAGER_ROLES[number])
            ? locationId
            : session.locationId || locationId;

        const res = await query(
            `SELECT id, location_id, name, type, balance, is_active 
             FROM financial_accounts 
             WHERE (location_id = $1 OR location_id IS NULL) 
             ORDER BY type DESC`,
            [effectiveLocationId]
        );

        logger.info({ locationId: effectiveLocationId, count: res.rows.length }, '[Treasury] getFinancialAccountsSecure');
        return { success: true, data: res.rows as FinancialAccount[] };

    } catch (error) {
        logger.error({ error }, '[Treasury] getFinancialAccountsSecure error');
        return { success: false, error: 'Error obteniendo cuentas financieras' };
    }
}

/**
 * 📋 Obtiene transacciones de una cuenta con RBAC
 */
export async function getTreasuryTransactionsSecure(
    accountId: string,
    limit: number = 50
): Promise<{ success: boolean; data?: TreasuryTransaction[]; error?: string }> {
    try {
        // Validación de sesión
        const session = await getSession();
        if (!session) {
            return { success: false, error: 'No autorizado' };
        }

        // Validar UUID
        const uuidParse = UUIDSchema.safeParse(accountId);
        if (!uuidParse.success) {
            return { success: false, error: 'ID de cuenta inválido' };
        }

        // Limitar a máximo 200
        const safeLimit = Math.min(Math.max(limit, 1), 200);

        const res = await query(
            `SELECT id, account_id, amount, type, description, created_at, created_by
             FROM treasury_transactions 
             WHERE account_id = $1 
             ORDER BY created_at DESC 
             LIMIT $2`,
            [accountId, safeLimit]
        );

        logger.info({ accountId, count: res.rows.length }, '[Treasury] getTreasuryTransactionsSecure');
        return { success: true, data: res.rows as TreasuryTransaction[] };

    } catch (error) {
        logger.error({ error }, '[Treasury] getTreasuryTransactionsSecure error');
        return { success: false, error: 'Error obteniendo transacciones' };
    }
}

/**
 * 📦 Obtiene remesas pendientes de una sucursal con RBAC
 */
export async function getPendingRemittancesSecure(
    locationId: string
): Promise<{ success: boolean; data?: Remittance[]; error?: string }> {
    try {
        // Validación de sesión
        const session = await getSession();
        if (!session) {
            return { success: false, error: 'No autorizado' };
        }

        // RBAC: Solo gerentes pueden ver todas las ubicaciones
        const effectiveLocationId = MANAGER_ROLES.includes(session.role as typeof MANAGER_ROLES[number])
            ? locationId
            : session.locationId || locationId;

        const res = await query(
            `SELECT id, location_id, source_terminal_id, amount, status, created_at, created_by
             FROM treasury_remittances 
             WHERE location_id = $1 AND status = 'PENDING_RECEIPT' 
             ORDER BY created_at ASC`,
            [effectiveLocationId]
        );

        logger.info({ locationId: effectiveLocationId, count: res.rows.length }, '[Treasury] getPendingRemittancesSecure');
        return { success: true, data: res.rows as Remittance[] };

    } catch (error) {
        logger.error({ error }, '[Treasury] getPendingRemittancesSecure error');
        return { success: false, error: 'Error obteniendo remesas pendientes' };
    }
}

// NOTE: AUTHORIZATION_THRESHOLDS y AUTHORIZED_ROLES son constantes internas
// Next.js 16 "use server" solo permite exportar async functions

// =====================================================
// ACCOUNTS PAYABLE (CUENTAS POR PAGAR)
// =====================================================

/**
 * Schema de validación para crear cuenta por pagar
 */
const CreateAccountPayableSchema = z.object({
    supplierId: UUIDSchema,
    invoiceNumber: z.string().min(1, "Número de factura requerido").max(50),
    invoiceType: z.enum(['FACTURA', 'BOLETA', 'NOTA_CREDITO', 'GUIA_DESPACHO']).default('FACTURA'),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)").optional(),
    netAmount: z.number().min(0, "Monto neto debe ser positivo"),
    taxAmount: z.number().min(0).default(0),
    totalAmount: z.number().positive("Monto total debe ser positivo"),
    locationId: UUIDSchema.optional(),
    purchaseOrderId: UUIDSchema.optional(),
    expenseCategory: z.enum(['INVENTORY', 'SERVICES', 'RENT', 'PAYROLL', 'OTHER']).default('INVENTORY'),
    notes: z.string().max(500).optional(),
    userId: z.string().min(1, "ID de usuario requerido"),
});

const RegisterPaymentSchema = z.object({
    accountPayableId: UUIDSchema,
    amount: z.number().positive("Monto debe ser positivo"),
    paymentMethod: z.enum(['TRANSFER', 'CHECK', 'CASH', 'CREDIT_NOTE']),
    paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").optional(),
    referenceNumber: z.string().max(100).optional(),
    bankAccountId: UUIDSchema.optional(),
    notes: z.string().max(500).optional(),
    userId: z.string().min(1, "ID de usuario requerido"),
});

/**
 * 📝 Tipos exportados para Accounts Payable
 */
export interface AccountPayable {
    id: string;
    supplier_id: string;
    supplier_name?: string;
    supplier_rut?: string;
    invoice_number: string;
    invoice_type: string;
    issue_date: string;
    due_date?: string;
    net_amount: number;
    tax_amount: number;
    total_amount: number;
    paid_amount: number;
    balance: number;
    status: 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'DISPUTED';
    expense_category: string;
    location_id?: string;
    created_at: string;
}

export interface AccountPayablePayment {
    id: string;
    account_payable_id: string;
    payment_date: string;
    amount: number;
    payment_method: string;
    reference_number?: string;
    status: string;
    created_at: string;
}

/**
 * 📝 Crear cuenta por pagar
 */
export async function createAccountPayableSecure(
    data: z.infer<typeof CreateAccountPayableSchema>
): Promise<{ success: boolean; accountPayableId?: string; error?: string }> {

    const validated = CreateAccountPayableSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message || 'Datos inválidos' };
    }

    const {
        supplierId, invoiceNumber, invoiceType, issueDate, dueDate,
        netAmount, taxAmount, totalAmount, locationId, purchaseOrderId,
        expenseCategory, notes, userId
    } = validated.data;

    try {
        // Verificar que el proveedor existe
        const supplierRes = await query(
            'SELECT id, business_name FROM suppliers WHERE id = $1',
            [supplierId]
        );

        if (supplierRes.rows.length === 0) {
            return { success: false, error: 'Proveedor no encontrado' };
        }

        // Verificar que no exista factura duplicada para este proveedor
        const duplicateRes = await query(
            'SELECT id FROM accounts_payable WHERE supplier_id = $1 AND invoice_number = $2 AND status != $3',
            [supplierId, invoiceNumber, 'CANCELLED']
        );

        if (duplicateRes.rows.length > 0) {
            return { success: false, error: 'Ya existe una factura con este número para este proveedor' };
        }

        // Insertar cuenta por pagar
        const insertRes = await query(`
            INSERT INTO accounts_payable (
                supplier_id, invoice_number, invoice_type, issue_date, due_date,
                net_amount, tax_amount, total_amount, paid_amount,
                location_id, purchase_order_id, expense_category, notes, 
                created_by, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, $11, $12, $13, 'PENDING')
            RETURNING id
        `, [
            supplierId, invoiceNumber, invoiceType, issueDate, dueDate || null,
            netAmount, taxAmount, totalAmount,
            locationId || null, purchaseOrderId || null, expenseCategory, notes || null,
            userId
        ]);

        const accountPayableId = insertRes.rows[0].id;

        // Auditar
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values)
            VALUES ($1, 'AP_CREATED', 'ACCOUNT_PAYABLE', $2, $3::jsonb)
        `, [userId, accountPayableId, JSON.stringify({
            supplier_id: supplierId,
            invoice_number: invoiceNumber,
            total_amount: totalAmount
        })]);

        logger.info({ accountPayableId, supplierId, invoiceNumber }, '✅ Cuenta por pagar creada');

        revalidatePath('/finance/treasury');
        revalidatePath('/finanzas');

        return { success: true, accountPayableId };

    } catch (error: unknown) {
        logger.error({ error, data: validated.data }, '❌ Error creando cuenta por pagar');
        return { success: false, error: error instanceof Error ? error.message : 'Error creando cuenta por pagar' };
    }
}

/**
 * 💰 Registrar pago a cuenta por pagar
 */
export async function registerAccountPayablePaymentSecure(
    data: z.infer<typeof RegisterPaymentSchema>
): Promise<{ success: boolean; paymentId?: string; newBalance?: number; error?: string }> {

    const validated = RegisterPaymentSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message || 'Datos inválidos' };
    }

    const {
        accountPayableId, amount, paymentMethod, paymentDate,
        referenceNumber, bankAccountId, notes, userId
    } = validated.data;

    try {
        // Obtener cuenta por pagar
        const apRes = await query(
            'SELECT * FROM accounts_payable WHERE id = $1',
            [accountPayableId]
        );

        if (apRes.rows.length === 0) {
            return { success: false, error: 'Cuenta por pagar no encontrada' };
        }

        const ap = apRes.rows[0];

        // Validar que no esté cancelada o pagada
        if (ap.status === 'CANCELLED') {
            return { success: false, error: 'No se puede pagar una cuenta anulada' };
        }

        if (ap.status === 'PAID') {
            return { success: false, error: 'Esta cuenta ya está pagada completamente' };
        }

        // Validar que el pago no exceda el saldo
        const currentBalance = Number(ap.total_amount) - Number(ap.paid_amount);
        if (amount > currentBalance) {
            return { success: false, error: `El pago excede el saldo pendiente ($${currentBalance.toLocaleString()})` };
        }

        // Insertar pago
        const paymentRes = await query(`
            INSERT INTO accounts_payable_payments (
                account_payable_id, payment_date, amount, payment_method,
                reference_number, bank_account_id, notes, created_by, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'COMPLETED')
            RETURNING id
        `, [
            accountPayableId,
            paymentDate || new Date().toISOString().split('T')[0],
            amount,
            paymentMethod,
            referenceNumber || null,
            bankAccountId || null,
            notes || null,
            userId
        ]);

        const paymentId = paymentRes.rows[0].id;

        // Obtener nuevo balance (el trigger actualiza automáticamente)
        const updatedRes = await query(
            'SELECT balance, status FROM accounts_payable WHERE id = $1',
            [accountPayableId]
        );
        const newBalance = Number(updatedRes.rows[0].balance);
        const newStatus = updatedRes.rows[0].status;

        // Auditar
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values)
            VALUES ($1, 'AP_PAYMENT', 'ACCOUNT_PAYABLE', $2, $3::jsonb)
        `, [userId, accountPayableId, JSON.stringify({
            payment_id: paymentId,
            amount,
            payment_method: paymentMethod,
            new_balance: newBalance,
            new_status: newStatus
        })]);

        logger.info({ paymentId, accountPayableId, amount, newBalance }, '✅ Pago registrado');

        revalidatePath('/finance/treasury');
        revalidatePath('/finanzas');

        return { success: true, paymentId, newBalance };

    } catch (error: unknown) {
        logger.error({ error, data: validated.data }, '❌ Error registrando pago');
        return { success: false, error: error instanceof Error ? error.message : 'Error registrando pago' };
    }
}

/**
 * 📋 Obtener lista de cuentas por pagar con filtros
 */
export async function getAccountsPayableSecure(
    params?: {
        supplierId?: string;
        status?: string;
        locationId?: string;
        startDate?: string;
        endDate?: string;
        limit?: number;
        offset?: number;
    }
): Promise<{ success: boolean; data?: AccountPayable[]; total?: number; error?: string }> {

    try {
        const session = await getSession();
        if (!session) {
            return { success: false, error: 'No autorizado' };
        }

        // Solo gerentes pueden ver todas las cuentas
        if (!MANAGER_ROLES.includes(session.role as typeof MANAGER_ROLES[number])) {
            return { success: false, error: 'Acceso denegado' };
        }

        let whereClause = 'WHERE 1=1';
        const sqlParams: unknown[] = [];

        if (params?.supplierId) {
            sqlParams.push(params.supplierId);
            whereClause += ` AND ap.supplier_id = $${sqlParams.length}`;
        }

        if (params?.status) {
            sqlParams.push(params.status);
            whereClause += ` AND ap.status = $${sqlParams.length}`;
        }

        if (params?.locationId) {
            sqlParams.push(params.locationId);
            whereClause += ` AND ap.location_id = $${sqlParams.length}`;
        }

        if (params?.startDate) {
            sqlParams.push(params.startDate);
            whereClause += ` AND ap.issue_date >= $${sqlParams.length}`;
        }

        if (params?.endDate) {
            sqlParams.push(params.endDate);
            whereClause += ` AND ap.issue_date <= $${sqlParams.length}`;
        }

        // Obtener total
        const countRes = await query(
            `SELECT COUNT(*) FROM accounts_payable ap ${whereClause}`,
            sqlParams
        );
        const total = parseInt(countRes.rows[0].count, 10);

        // Obtener datos con paginación
        const limit = Math.min(params?.limit || 50, 200);
        const offset = params?.offset || 0;
        sqlParams.push(limit, offset);

        const dataRes = await query(`
            SELECT 
                ap.id, ap.supplier_id, 
                COALESCE(s.fantasy_name, s.business_name) as supplier_name,
                s.rut as supplier_rut,
                ap.invoice_number, ap.invoice_type,
                ap.issue_date, ap.due_date,
                ap.net_amount, ap.tax_amount, ap.total_amount,
                ap.paid_amount, ap.balance, ap.status,
                ap.expense_category, ap.location_id,
                ap.created_at
            FROM accounts_payable ap
            LEFT JOIN suppliers s ON ap.supplier_id = s.id
            ${whereClause}
            ORDER BY 
                CASE ap.status 
                    WHEN 'OVERDUE' THEN 1 
                    WHEN 'PENDING' THEN 2 
                    WHEN 'PARTIAL' THEN 3 
                    ELSE 4 
                END,
                ap.due_date ASC NULLS LAST
            LIMIT $${sqlParams.length - 1} OFFSET $${sqlParams.length}
        `, sqlParams);

        logger.info({ count: dataRes.rows.length, total }, '[Treasury] getAccountsPayableSecure');

        return { success: true, data: dataRes.rows as AccountPayable[], total };

    } catch (error: unknown) {
        logger.error({ error }, '❌ Error obteniendo cuentas por pagar');
        return { success: false, error: 'Error obteniendo cuentas por pagar' };
    }
}

/**
 * 📊 Obtener resumen de cuentas por pagar (Dashboard)
 */
export async function getAccountsPayableSummarySecure(
    locationId?: string
): Promise<{
    success: boolean;
    data?: {
        totalPending: number;
        totalOverdue: number;
        countPending: number;
        countOverdue: number;
        byCategory: { category: string; total: number }[];
        aging: {
            current: number;
            days1_30: number;
            days31_60: number;
            days61_90: number;
            over90: number;
        };
    };
    error?: string;
}> {
    try {
        const session = await getSession();
        if (!session) {
            return { success: false, error: 'No autorizado' };
        }

        const locationFilter = locationId ? 'AND location_id = $1' : '';
        const params = locationId ? [locationId] : [];

        // Total y conteo pendiente
        const pendingRes = await query(`
            SELECT 
                COALESCE(SUM(balance), 0) as total,
                COUNT(*) as count
            FROM accounts_payable 
            WHERE status IN ('PENDING', 'PARTIAL') ${locationFilter}
        `, params);

        // Total y conteo vencido
        const overdueRes = await query(`
            SELECT 
                COALESCE(SUM(balance), 0) as total,
                COUNT(*) as count
            FROM accounts_payable 
            WHERE status = 'OVERDUE' ${locationFilter}
        `, params);

        // Por categoría
        const categoryRes = await query(`
            SELECT 
                expense_category as category,
                COALESCE(SUM(balance), 0) as total
            FROM accounts_payable 
            WHERE status IN ('PENDING', 'PARTIAL', 'OVERDUE') ${locationFilter}
            GROUP BY expense_category
            ORDER BY total DESC
        `, params);

        // Aging
        const agingRes = await query(`
            SELECT 
                COALESCE(SUM(CASE WHEN due_date >= CURRENT_DATE THEN balance ELSE 0 END), 0) as current,
                COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - 30 THEN balance ELSE 0 END), 0) as days_1_30,
                COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE - 30 AND due_date >= CURRENT_DATE - 60 THEN balance ELSE 0 END), 0) as days_31_60,
                COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE - 60 AND due_date >= CURRENT_DATE - 90 THEN balance ELSE 0 END), 0) as days_61_90,
                COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE - 90 THEN balance ELSE 0 END), 0) as over_90
            FROM accounts_payable 
            WHERE status IN ('PENDING', 'PARTIAL', 'OVERDUE') ${locationFilter}
        `, params);

        const aging = agingRes.rows[0];

        return {
            success: true,
            data: {
                totalPending: Number(pendingRes.rows[0].total),
                totalOverdue: Number(overdueRes.rows[0].total),
                countPending: parseInt(pendingRes.rows[0].count, 10),
                countOverdue: parseInt(overdueRes.rows[0].count, 10),
                byCategory: categoryRes.rows.map(r => ({
                    category: r.category,
                    total: Number(r.total)
                })),
                aging: {
                    current: Number(aging.current),
                    days1_30: Number(aging.days_1_30),
                    days31_60: Number(aging.days_31_60),
                    days61_90: Number(aging.days_61_90),
                    over90: Number(aging.over_90)
                }
            }
        };

    } catch (error: unknown) {
        logger.error({ error }, '❌ Error obteniendo resumen de cuentas por pagar');
        return { success: false, error: 'Error obteniendo resumen' };
    }
}

/**
 * ❌ Anular cuenta por pagar
 */
export async function cancelAccountPayableSecure(
    accountPayableId: string,
    reason: string,
    userId: string
): Promise<{ success: boolean; error?: string }> {

    if (!z.string().uuid().safeParse(accountPayableId).success) {
        return { success: false, error: 'ID inválido' };
    }

    if (!reason || reason.length < 10) {
        return { success: false, error: 'Motivo de anulación requerido (mínimo 10 caracteres)' };
    }

    try {
        // Verificar que existe y no tiene pagos
        const apRes = await query(
            'SELECT * FROM accounts_payable WHERE id = $1',
            [accountPayableId]
        );

        if (apRes.rows.length === 0) {
            return { success: false, error: 'Cuenta por pagar no encontrada' };
        }

        const ap = apRes.rows[0];

        if (ap.status === 'CANCELLED') {
            return { success: false, error: 'Esta cuenta ya está anulada' };
        }

        if (Number(ap.paid_amount) > 0) {
            return { success: false, error: 'No se puede anular una cuenta con pagos registrados' };
        }

        // Anular
        await query(`
            UPDATE accounts_payable 
            SET status = 'CANCELLED', notes = COALESCE(notes, '') || E'\n[ANULADA] ' || $1, updated_at = NOW()
            WHERE id = $2
        `, [reason, accountPayableId]);

        // Auditar
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, old_values, new_values)
            VALUES ($1, 'AP_CANCELLED', 'ACCOUNT_PAYABLE', $2, $3::jsonb, $4::jsonb)
        `, [userId, accountPayableId, JSON.stringify(ap), JSON.stringify({ reason })]);

        logger.info({ accountPayableId, reason }, '✅ Cuenta por pagar anulada');

        revalidatePath('/finance/treasury');
        revalidatePath('/finanzas');

        return { success: true };

    } catch (error: unknown) {
        logger.error({ error }, '❌ Error anulando cuenta por pagar');
        return { success: false, error: 'Error anulando cuenta por pagar' };
    }
}

/**
 * 📜 Obtener historial de pagos de una cuenta
 */
export async function getAccountPayablePaymentsSecure(
    accountPayableId: string
): Promise<{ success: boolean; data?: AccountPayablePayment[]; error?: string }> {

    if (!z.string().uuid().safeParse(accountPayableId).success) {
        return { success: false, error: 'ID inválido' };
    }

    try {
        const res = await query(`
            SELECT 
                p.id, p.account_payable_id, p.payment_date, p.amount,
                p.payment_method, p.reference_number, p.status,
                p.notes, p.created_at,
                u.name as created_by_name
            FROM accounts_payable_payments p
            LEFT JOIN users u ON p.created_by = u.id
            WHERE p.account_payable_id = $1
            ORDER BY p.payment_date DESC, p.created_at DESC
        `, [accountPayableId]);

        return { success: true, data: res.rows as AccountPayablePayment[] };

    } catch (error: unknown) {
        logger.error({ error }, '❌ Error obteniendo pagos');
        return { success: false, error: 'Error obteniendo historial de pagos' };
    }
}
