#!/usr/bin/env tsx

/**
 * 🚀 PRE-DEPLOY VERIFICATION SCRIPT
 * Pharma-Synapse v3.1 - Farmacias Vallenar
 * 
 * Verifica que el sistema esté listo para deploy a producción:
 * - Build exitoso
 * - Tests pasando
 * - Variables de entorno configuradas
 * - Conexión a base de datos
 * - Migraciones aplicadas
 * - No hay PINs en texto plano
 * - Tablas de auditoría existen
 * 
 * Uso:
 *   npx tsx src/scripts/pre-deploy-check.ts
 * 
 * Exit codes:
 *   0 = Todo OK, listo para deploy
 *   1 = Verificación falló, NO deployar
 * 
 * @version 1.0.0
 * @date 2024-12-24
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

// =====================================================
// COLORES PARA OUTPUT
// =====================================================

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

const emoji = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
    rocket: '🚀',
    check: '🔍',
    database: '🗄️',
    lock: '🔐',
};

// =====================================================
// HELPERS
// =====================================================

function printHeader(text: string) {
    console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}  ${emoji.rocket} ${text}${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
}

function printSection(text: string) {
    console.log(`\n${colors.bright}${colors.blue}${emoji.check} ${text}${colors.reset}`);
    console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}`);
}

function printSuccess(text: string) {
    console.log(`  ${emoji.success} ${colors.green}${text}${colors.reset}`);
}

function printError(text: string) {
    console.log(`  ${emoji.error} ${colors.red}${text}${colors.reset}`);
}

function printWarning(text: string) {
    console.log(`  ${emoji.warning} ${colors.yellow}${text}${colors.reset}`);
}

function printInfo(text: string) {
    console.log(`  ${emoji.info} ${colors.dim}${text}${colors.reset}`);
}

// =====================================================
// VERIFICACIONES
// =====================================================

let hasErrors = false;
let warningCount = 0;

/**
 * 1. Verificar que el build compile sin errores
 */
async function checkBuild(): Promise<boolean> {
    printSection('1. Build Verification');

    try {
        printInfo('Ejecutando: npm run build...');
        execSync('npm run build', {
            stdio: 'pipe',
            encoding: 'utf-8',
            timeout: 120000, // 2 minutos max
        });
        printSuccess('Build compilado exitosamente');
        return true;
    } catch (error: any) {
        printError('Build falló');
        console.log(error.stdout || error.message);
        return false;
    }
}

/**
 * 2. Verificar que los tests pasen
 */
async function checkTests(): Promise<boolean> {
    printSection('2. Test Suite Verification');

    try {
        printInfo('Ejecutando: npm test...');
        const output = execSync('npm test -- --run', {
            stdio: 'pipe',
            encoding: 'utf-8',
            timeout: 120000,
        });

        // Buscar el resumen de tests
        const passMatch = output.match(/(\d+) passed/);
        const failMatch = output.match(/(\d+) failed/);

        if (failMatch) {
            printError(`Tests fallaron: ${failMatch[1]} test(s) con error`);
            return false;
        }

        if (passMatch) {
            printSuccess(`Todos los tests pasaron: ${passMatch[1]} test(s)`);
            return true;
        }

        printWarning('No se pudo determinar el resultado de tests');
        warningCount++;
        return true;
    } catch (error: any) {
        printError('Tests fallaron o no se pudieron ejecutar');
        printInfo(error.message);
        return false;
    }
}

/**
 * 3. Verificar variables de entorno requeridas
 */
async function checkEnvVars(): Promise<boolean> {
    printSection('3. Environment Variables Verification');

    const requiredVars = [
        'DATABASE_URL',
        'NEXTAUTH_SECRET',
        'NEXTAUTH_URL',
    ];

    const optionalVars = [
        'SII_API_KEY',
        'SII_RUT_EMPRESA',
        'SMTP_HOST',
    ];

    let allPresent = true;

    // Verificar obligatorias
    for (const varName of requiredVars) {
        if (process.env[varName]) {
            printSuccess(`${varName} configurada`);
        } else {
            printError(`${varName} NO configurada (REQUERIDA)`);
            allPresent = false;
        }
    }

    // Verificar opcionales
    for (const varName of optionalVars) {
        if (process.env[varName]) {
            printInfo(`${varName} configurada (opcional)`);
        } else {
            printWarning(`${varName} no configurada (opcional)`);
            warningCount++;
        }
    }

    return allPresent;
}

/**
 * 4. Verificar conexión a base de datos
 */
async function checkDatabaseConnection(): Promise<boolean> {
    printSection('4. Database Connection Verification');

    try {
        const { pool } = await import('../lib/db');
        const client = await pool.connect();

        const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
        const { current_time, pg_version } = result.rows[0];

        printSuccess('Conexión a base de datos exitosa');
        printInfo(`PostgreSQL: ${pg_version.split(' ')[0]} ${pg_version.split(' ')[1]}`);
        printInfo(`Server time: ${current_time}`);

        client.release();
        return true;
    } catch (error: any) {
        printError('No se pudo conectar a la base de datos');
        printInfo(error.message);
        return false;
    }
}

/**
 * 5. Verificar que las migraciones estén aplicadas
 */
async function checkMigrations(): Promise<boolean> {
    printSection('5. Database Migrations Verification');

    try {
        const { query } = await import('../lib/db');

        // Verificar tabla de migraciones existe
        const tableCheck = await query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'schema_migrations'
            ) as exists
        `);

        if (!tableCheck.rows[0].exists) {
            printError('Tabla schema_migrations no existe');
            return false;
        }

        // Obtener migraciones aplicadas
        const migRes = await query(`
            SELECT version, description, applied_at 
            FROM schema_migrations 
            ORDER BY version
        `);

        const requiredMigrations = [
            '001', '002', '003', '004', '005', '006', '007'
        ];

        const appliedVersions = migRes.rows.map((r: any) => r.version);

        let allApplied = true;
        for (const req of requiredMigrations) {
            if (appliedVersions.includes(req)) {
                const migration = migRes.rows.find((r: any) => r.version === req);
                printSuccess(`Migración ${req}: ${migration.description}`);
            } else {
                printError(`Migración ${req} NO aplicada`);
                allApplied = false;
            }
        }

        printInfo(`Total migraciones aplicadas: ${migRes.rowCount}`);
        return allApplied;
    } catch (error: any) {
        printError('Error verificando migraciones');
        printInfo(error.message);
        return false;
    }
}

/**
 * 6. Verificar que no haya PINs en texto plano
 */
async function checkPinSecurity(): Promise<boolean> {
    printSection('6. PIN Security Verification');

    try {
        const { query } = await import('../lib/db');

        const result = await query(`
            SELECT 
                COUNT(*) FILTER (WHERE access_pin IS NOT NULL AND access_pin_hash IS NULL) as plaintext_count,
                COUNT(*) FILTER (WHERE access_pin_hash IS NOT NULL) as hashed_count,
                COUNT(*) as total
            FROM users
            WHERE is_active = true
        `);

        const { plaintext_count, hashed_count, total } = result.rows[0];

        if (parseInt(plaintext_count) > 0) {
            printError(`${plaintext_count} usuario(s) con PIN en texto plano`);
            printInfo('Ejecutar: npm run migrate:pins');
            return false;
        }

        printSuccess(`Todos los PINs hasheados con bcrypt (${hashed_count}/${total})`);
        return true;
    } catch (error: any) {
        printError('Error verificando seguridad de PINs');
        printInfo(error.message);
        return false;
    }
}

/**
 * 7. Verificar que las tablas de auditoría existan
 */
async function checkAuditTables(): Promise<boolean> {
    printSection('7. Audit System Verification');

    try {
        const { query } = await import('../lib/db');

        const requiredTables = [
            'audit_log',
            'audit_action_catalog',
        ];

        let allExist = true;

        for (const tableName of requiredTables) {
            const result = await query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = $1
                ) as exists
            `, [tableName]);

            if (result.rows[0].exists) {
                printSuccess(`Tabla ${tableName} existe`);
            } else {
                printError(`Tabla ${tableName} NO existe`);
                allExist = false;
            }
        }

        // Verificar que hay datos en el catálogo
        const catalogCount = await query('SELECT COUNT(*) as count FROM audit_action_catalog');
        const count = parseInt(catalogCount.rows[0].count);

        if (count > 0) {
            printSuccess(`Catálogo de auditoría: ${count} acciones registradas`);
        } else {
            printWarning('Catálogo de auditoría vacío');
            warningCount++;
        }

        return allExist;
    } catch (error: any) {
        printError('Error verificando sistema de auditoría');
        printInfo(error.message);
        return false;
    }
}

// =====================================================
// MAIN
// =====================================================

async function main() {
    printHeader('PRE-DEPLOY VERIFICATION - Pharma-Synapse v3.1');

    printInfo('Este script verifica que el sistema esté listo para deploy a producción');
    printInfo(`Fecha: ${new Date().toLocaleString('es-CL')}\n`);

    // Ejecutar verificaciones
    const checks = [
        { name: 'Build', fn: checkBuild },
        { name: 'Tests', fn: checkTests },
        { name: 'Environment Variables', fn: checkEnvVars },
        { name: 'Database Connection', fn: checkDatabaseConnection },
        { name: 'Migrations', fn: checkMigrations },
        { name: 'PIN Security', fn: checkPinSecurity },
        { name: 'Audit System', fn: checkAuditTables },
    ];

    const results: { name: string; passed: boolean }[] = [];

    for (const check of checks) {
        try {
            const passed = await check.fn();
            results.push({ name: check.name, passed });
            if (!passed) hasErrors = true;
        } catch (error) {
            console.error(`\nError ejecutando verificación ${check.name}:`, error);
            results.push({ name: check.name, passed: false });
            hasErrors = true;
        }
    }

    // Resumen final
    printHeader('RESUMEN DE VERIFICACIÓN');

    const passedCount = results.filter(r => r.passed).length;
    const failedCount = results.filter(r => !r.passed).length;

    results.forEach(({ name, passed }) => {
        if (passed) {
            printSuccess(`${name}: PASSED`);
        } else {
            printError(`${name}: FAILED`);
        }
    });

    console.log(`\n${colors.bright}${'─'.repeat(60)}${colors.reset}`);
    console.log(`${colors.bright}Verificaciones pasadas: ${colors.green}${passedCount}${colors.reset} / ${results.length}`);
    console.log(`${colors.bright}Verificaciones fallidas: ${colors.red}${failedCount}${colors.reset} / ${results.length}`);

    if (warningCount > 0) {
        console.log(`${colors.bright}Advertencias: ${colors.yellow}${warningCount}${colors.reset}`);
    }
    console.log(`${colors.bright}${'─'.repeat(60)}${colors.reset}\n`);

    // Veredicto final
    if (hasErrors) {
        printError('❌ SISTEMA NO LISTO PARA DEPLOY');
        printInfo('Corrija los errores antes de deployar a producción\n');
        process.exit(1);
    } else {
        printSuccess('🎉 SISTEMA LISTO PARA DEPLOY A PRODUCCIÓN');
        if (warningCount > 0) {
            printWarning(`Hay ${warningCount} advertencia(s), pero son opcionales`);
        }
        printInfo('Puede proceder con el deploy de forma segura\n');
        process.exit(0);
    }
}

// Ejecutar
main().catch((error) => {
    console.error('\n❌ Error fatal en pre-deploy check:', error);
    process.exit(1);
});
