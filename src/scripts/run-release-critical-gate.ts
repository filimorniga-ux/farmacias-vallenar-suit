#!/usr/bin/env tsx

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import {
    buildReleaseCriticalDbUnavailableMessage,
    buildReleaseCriticalGateEnv,
    getReleaseCriticalDbSuitabilityIssue,
    redactConnectionString,
    resolveReleaseCriticalGateDbTarget,
    type GateEnvInput,
    type ReleaseCriticalGateDbTarget,
} from './e2e-release-critical-db-policy';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function getSslConfig(connectionString: string) {
    return connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
        ? undefined
        : { rejectUnauthorized: false };
}

function getBinaryName(name: 'npm' | 'npx') {
    return process.platform === 'win32' ? `${name}.cmd` : name;
}

function runCommand(command: string, args: string[], env: GateEnvInput) {
    return new Promise<void>((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: path.resolve(__dirname, '../..'),
            stdio: 'inherit',
            env: env as NodeJS.ProcessEnv,
        });

        child.on('error', (error: Error) => reject(error));
        child.on('exit', (code: number | null) => {
            if (code === 0) {
                resolve();
                return;
            }

            reject(new Error(`${command} ${args.join(' ')} terminó con código ${code ?? 'unknown'}`));
        });
    });
}

async function runDbPreflight(target: ReleaseCriticalGateDbTarget) {
    const pool = new Pool({
        connectionString: target.connectionString,
        ssl: getSslConfig(target.connectionString),
        max: 1,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 10000,
    });

    try {
        const result = await pool.query('SELECT 1 as ok');
        if (result.rows[0]?.ok !== 1) {
            throw new Error('SELECT 1 no devolvió el payload esperado');
        }
    } finally {
        await pool.end().catch(() => undefined);
    }
}

async function main() {
    const resolution = resolveReleaseCriticalGateDbTarget(process.env);

    if (!resolution.ok) {
        console.error('❌ [E2E Gate] No se pudo resolver una DB válida para el gate crítico.');
        for (const error of resolution.errors) {
            console.error(`   - ${error}`);
        }
        console.error(`   - baseURL: ${resolution.baseUrl}`);
        console.error(`   - port: ${resolution.port}`);
        console.error(`   - fallback local esperado: ${resolution.fallbackUrl}`);
        process.exit(1);
    }

    const { target } = resolution;
    console.log(`🧭 [E2E Gate] modo: ${target.mode}`);
    console.log(`🧭 [E2E Gate] source: ${target.source}`);
    console.log(`🧭 [E2E Gate] reason: ${target.reason}`);
    console.log(`🧭 [E2E Gate] DATABASE_URL efectiva: ${redactConnectionString(target.connectionString)}`);
    console.log(`🧭 [E2E Gate] target: ${target.host}:${target.portNumber}/${target.databaseName}`);
    console.log(`🧭 [E2E Gate] baseURL: ${target.baseUrl}`);

    const suitabilityIssue = getReleaseCriticalDbSuitabilityIssue(target);
    if (suitabilityIssue) {
        console.error(`❌ [E2E Gate] ${suitabilityIssue}`);
        process.exit(1);
    }

    try {
        await runDbPreflight(target);
        console.log(`✅ [E2E Gate] Preflight DB OK: ${target.host}:${target.portNumber}/${target.databaseName}`);
    } catch (error) {
        console.error(`❌ [E2E Gate] ${buildReleaseCriticalDbUnavailableMessage(target, error)}`);
        process.exit(1);
    }

    const gateEnv = buildReleaseCriticalGateEnv(process.env, target);
    const npm = getBinaryName('npm');
    const npx = getBinaryName('npx');

    await runCommand(npm, ['run', 'seed:demo'], gateEnv);
    await runCommand(npx, [
        'playwright',
        'test',
        '--project=chromium',
        'tests/e2e/login-flow.spec.ts',
        'tests/e2e/pos.spec.ts',
        'tests/e2e/treasury.spec.ts',
        'tests/e2e/reports.spec.ts',
    ], gateEnv);
}

main().catch((error) => {
    console.error('❌ [E2E Gate] Runner crítico falló:', error instanceof Error ? error.message : error);
    process.exit(1);
});
