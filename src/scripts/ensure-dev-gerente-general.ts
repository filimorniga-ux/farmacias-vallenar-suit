#!/usr/bin/env tsx

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local'), override: false });
config({ path: resolve(process.cwd(), '.env'), override: false });

import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { getClient } from '../lib/db';

const DEV_ACCOUNT = {
    rut: '22.222.222-2',
    name: '[DEV] Gerente General 1',
    email: 'dev.gerente.general.1@local.invalid',
    role: 'GERENTE_GENERAL',
    jobTitle: 'DEV_TEST_ACCOUNT',
    pin: '1213',
} as const;

type DevAccountRow = {
    id: string;
    rut: string;
    name: string;
    email: string | null;
    role: string;
    job_title: string | null;
    is_active: boolean;
    token_version: number | null;
};

async function main() {
    const client = await getClient();

    try {
        await client.query('BEGIN');

        const existingRes = await client.query<DevAccountRow>(
            `
                SELECT id, rut, name, email, role, job_title, is_active, token_version
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

        if (existingRes.rows.length > 1) {
            throw new Error(
                `Se encontraron múltiples cuentas candidatas para la cuenta DEV (${existingRes.rows.length}). Limpia las duplicadas antes de continuar.`
            );
        }

        const hashedPin = await bcrypt.hash(DEV_ACCOUNT.pin, 10);

        if (existingRes.rows.length === 1) {
            const existing = existingRes.rows[0];

            await client.query(
                `
                    UPDATE users
                    SET rut = $2,
                        name = $3,
                        email = $4,
                        role = $5,
                        job_title = $6,
                        access_pin_hash = $7,
                        access_pin = NULL,
                        status = 'ACTIVE',
                        is_active = true,
                        assigned_location_id = NULL,
                        session_token = NULL,
                        token_version = COALESCE(token_version, 1) + 1,
                        updated_at = NOW()
                    WHERE id = $1
                `,
                [
                    existing.id,
                    DEV_ACCOUNT.rut,
                    DEV_ACCOUNT.name,
                    DEV_ACCOUNT.email,
                    DEV_ACCOUNT.role,
                    DEV_ACCOUNT.jobTitle,
                    hashedPin,
                ]
            );

            await client.query('COMMIT');
            console.log(`✅ Cuenta DEV actualizada: ${DEV_ACCOUNT.name} (${existing.id})`);
            console.log('ℹ️ Sesiones previas invalidadas con token_version++ y session_token = NULL');
            return;
        }

        const id = randomUUID();

        await client.query(
            `
                INSERT INTO users (
                    id,
                    rut,
                    name,
                    email,
                    role,
                    access_pin_hash,
                    access_pin,
                    job_title,
                    status,
                    is_active,
                    assigned_location_id,
                    session_token,
                    token_version,
                    created_at,
                    updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, NULL, $7, 'ACTIVE', true, NULL, NULL, 1, NOW(), NOW()
                )
            `,
            [
                id,
                DEV_ACCOUNT.rut,
                DEV_ACCOUNT.name,
                DEV_ACCOUNT.email,
                DEV_ACCOUNT.role,
                hashedPin,
                DEV_ACCOUNT.jobTitle,
            ]
        );

        await client.query('COMMIT');
        console.log(`✅ Cuenta DEV creada: ${DEV_ACCOUNT.name} (${id})`);
        console.log('ℹ️ PIN configurado: 1213');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ No fue posible asegurar la cuenta DEV:', error);
        process.exitCode = 1;
    } finally {
        client.release();
    }
}

main().catch((error) => {
    console.error('❌ Error fatal asegurando la cuenta DEV:', error);
    process.exit(1);
});
