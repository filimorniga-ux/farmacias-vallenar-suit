#!/usr/bin/env tsx

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { Command } from 'commander';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const program = new Command();

program
    .name('terminals-cli')
    .description('CLI unificado para gestión de terminales POS')
    .version('1.0.0');

// ============================================
// COMANDO: STATUS
// ============================================
program
    .command('status')
    .description('Ver estado actual de todos los terminales')
    .option('-l, --location <id>', 'Filtrar por location')
    .action(async (options) => {
        try {
            let sql = 'SELECT * FROM v_terminals_status'; // Will rely on view created by migration
            // Fallback if view doesn't exist yet (pre-migration)
            const viewExists = await pool.query("SELECT to_regclass('v_terminals_status')");

            if (!viewExists.rows[0].to_regclass) {
                console.log('⚠️ Vista v_terminals_status no existe. Usando consulta básica.');
                sql = `
                    SELECT t.id, t.name, t.status, t.location_id, t.current_cashier_id 
                    FROM terminals t
                `;
            }

            const params: any[] = [];

            if (options.location) {
                sql += viewExists.rows[0].to_regclass ? ' WHERE location_id = $1' : ' WHERE location_id = $1';
                params.push(options.location);
            }

            const result = await pool.query(sql, params);

            console.log('\n📊 ESTADO DE TERMINALES\n');
            console.table(result.rows);

        } catch (error) {
            console.error('❌ Error:', error);
        } finally {
            await pool.end();
        }
    });

// ============================================
// COMANDO: HEALTH
// ============================================
program
    .command('health')
    .description('Diagnóstico completo del sistema')
    .action(async () => {
        try {
            console.log('\n🏥 DIAGNÓSTICO DE SALUD DEL SISTEMA POS\n');

            // 1. Verificar terminales huérfanos
            // Terminals.location_id is UUID. Locations.id is UUID. No cast needed.
            const orphans = await pool.query(`
                SELECT COUNT(*) as count FROM terminals
                WHERE location_id NOT IN (SELECT id FROM locations)
            `);

            console.log(`✅ Terminales huérfanos: ${orphans.rows[0].count}`);

            // 2. Verificar sesiones duplicadas
            const duplicates = await pool.query(`
                SELECT terminal_id, COUNT(*) as count
                FROM cash_register_sessions
                WHERE status = 'OPEN'
                GROUP BY terminal_id
                HAVING COUNT(*) > 1
            `);

            console.log(`✅ Sesiones duplicadas: ${duplicates.rows.length}`);

            // 3. Verificar integridad de FKs logic (manual check if view missing)
            try {
                const zombies = await pool.query('SELECT * FROM v_zombie_sessions');
                console.log(`⚠️  Sesiones zombie (>12h): ${zombies.rows.length}`);
                if (zombies.rows.length > 0) console.table(zombies.rows);
            } catch (e) {
                console.log('⚠️ Vista v_zombie_sessions no disponible (requiere migración 003)');
            }

            console.log('\n');

        } catch (error) {
            console.error('❌ Error:', error);
        } finally {
            await pool.end();
        }
    });

// ============================================
// COMANDO: CLEANUP
// ============================================
program
    .command('cleanup')
    .description('Limpiar sesiones antiguas y terminales zombie')
    .option('--dry-run', 'Mostrar qué se haría sin ejecutar cambios')
    .action(async (options) => {
        try {
            console.log('\n🧹 LIMPIEZA DE SISTEMA\n');

            if (options.dryRun) {
                console.log('🔍 MODO DRY-RUN: No se harán cambios\n');
            }

            // 1. Cerrar sesiones >24h
            const staleQuery = `
                UPDATE cash_register_sessions
                SET status = 'CLOSED_AUTO',
                    closed_at = NOW(),
                    notes = 'Auto-cerrado por CLI cleanup'
                WHERE status = 'OPEN'
                  AND (opened_at < NOW() - INTERVAL '24 hours' OR opened_at IS NULL) 
                ${options.dryRun ? 'RETURNING id' : ''}
            `;

            if (!options.dryRun) {
                const staleResult = await pool.query(staleQuery);
                console.log(`✅ Sesiones cerradas: ${staleResult.rowCount}`);
            } else {
                const staleCheck = await pool.query(`
                    SELECT id FROM cash_register_sessions 
                    WHERE status='OPEN' AND opened_at < NOW() - INTERVAL '24 hours'
                 `);
                console.log(`✅ Sesiones a cerrar (Dry Run): ${staleCheck.rowCount || 0}`);
                if ((staleCheck.rowCount || 0) > 0) console.table(staleCheck.rows);
            }

            // 2. Liberar terminales sin sesión activa (Orphaned Open Terminals)
            if (!options.dryRun) {
                const orphanTerminalsQuery = `
                    UPDATE terminals
                    SET status = 'CLOSED', current_cashier_id = NULL
                    WHERE status = 'OPEN'
                      AND NOT EXISTS (
                          SELECT 1 FROM cash_register_sessions s
                          WHERE s.terminal_id = terminals.id AND s.status = 'OPEN'
                      )
                `;
                const orphanResult = await pool.query(orphanTerminalsQuery);
                console.log(`✅ Terminales liberados: ${orphanResult.rowCount || 0}`);
            } else {
                const orphanCheck = await pool.query(`
                    SELECT id, name FROM terminals 
                    WHERE status='OPEN' AND NOT EXISTS (
                        SELECT 1 FROM cash_register_sessions s 
                        WHERE s.terminal_id = terminals.id AND s.status = 'OPEN'
                    )
                 `);
                console.log(`✅ Terminales a liberar (Dry Run): ${orphanCheck.rowCount || 0}`);
                if ((orphanCheck.rowCount || 0) > 0) console.table(orphanCheck.rows);
            }

            console.log('\n✨ Limpieza completada\n');

        } catch (error) {
            console.error('❌ Error:', error);
        } finally {
            await pool.end();
        }
    });

program.parse();
