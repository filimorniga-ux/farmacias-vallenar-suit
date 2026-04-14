#!/usr/bin/env tsx

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local'), override: false });
config({ path: resolve(process.cwd(), '.env'), override: false });

import bcrypt from 'bcryptjs';
import { getClient } from '../lib/db';

const DEV_ACCOUNT = {
    name: '[DEV] Gerente General 1',
    email: 'dev.gerente.general.1@local.invalid',
    jobTitle: 'DEV_TEST_ACCOUNT',
} as const;

const args = process.argv.slice(2);
const rotatePinIndex = args.indexOf('--rotate-pin');
const rotatePin = rotatePinIndex >= 0 ? args[rotatePinIndex + 1] : undefined;

function validateRotatePin(pin?: string) {
    if (!pin) {
        return { valid: false, error: 'Debes indicar un PIN después de --rotate-pin' };
    }

    if (!/^\d{4,6}$/.test(pin)) {
        return { valid: false, error: 'El PIN nuevo debe tener entre 4 y 6 dígitos numéricos' };
    }

    return { valid: true };
}

async function main() {
    if (rotatePinIndex >= 0) {
        const validation = validateRotatePin(rotatePin);
        if (!validation.valid) {
            console.error(`❌ ${validation.error}`);
            process.exit(1);
        }
    }

    const client = await getClient();

    try {
        await client.query('BEGIN');

        const existingRes = await client.query<{
            id: string;
            is_active: boolean;
            token_version: number | null;
        }>(
            `
                SELECT id, is_active, token_version
                FROM users
                WHERE email = $1
                   OR job_title = $2
                   OR name = $3
                ORDER BY
                    CASE
                        WHEN email = $1 THEN 0
                        WHEN job_title = $2 THEN 1
                        ELSE 2
                    END,
                    updated_at DESC NULLS LAST
            `,
            [DEV_ACCOUNT.email, DEV_ACCOUNT.jobTitle, DEV_ACCOUNT.name]
        );

        if (existingRes.rows.length === 0) {
            await client.query('ROLLBACK');
            console.log('ℹ️ No existe cuenta DEV para desactivar o rotar.');
            return;
        }

        if (existingRes.rows.length > 1) {
            throw new Error(
                `Se encontraron múltiples cuentas candidatas para la cuenta DEV (${existingRes.rows.length}). Limpia las duplicadas antes de continuar.`
            );
        }

        const devAccount = existingRes.rows[0];

        if (rotatePin) {
            const hashedPin = await bcrypt.hash(rotatePin, 10);

            await client.query(
                `
                    UPDATE users
                    SET access_pin_hash = $2,
                        access_pin = NULL,
                        status = 'ACTIVE',
                        is_active = true,
                        session_token = NULL,
                        token_version = COALESCE(token_version, 1) + 1,
                        updated_at = NOW()
                    WHERE id = $1
                `,
                [devAccount.id, hashedPin]
            );

            await client.query('COMMIT');
            console.log(`✅ PIN rotado para la cuenta DEV (${devAccount.id}).`);
            console.log('ℹ️ Sesiones previas invalidadas con token_version++ y session_token = NULL');
            return;
        }

        await client.query(
            `
                UPDATE users
                SET is_active = false,
                    status = 'TERMINATED',
                    session_token = NULL,
                    token_version = COALESCE(token_version, 1) + 1,
                    updated_at = NOW()
                WHERE id = $1
            `,
            [devAccount.id]
        );

        await client.query('COMMIT');
        console.log(`✅ Cuenta DEV desactivada (${devAccount.id}).`);
        console.log('ℹ️ Sesiones previas invalidadas con token_version++ y session_token = NULL');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ No fue posible desactivar/rotar la cuenta DEV:', error);
        process.exitCode = 1;
    } finally {
        client.release();
    }
}

main().catch((error) => {
    console.error('❌ Error fatal administrando la cuenta DEV:', error);
    process.exit(1);
});
