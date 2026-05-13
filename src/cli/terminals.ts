
import { Command } from 'commander';
import { pool } from '../lib/db-cli'; // CLI-Safe DB Pool
import { assertScriptDbWriteTargetAllowed } from '../scripts/script-db-target-policy';

// Mock environment variables if needed, but dotenv is loaded by tsx/next usually. 
// For standalone, we might need 'dotenv/config' if not automatically loaded.
import 'dotenv/config';

const program = new Command();
const TERMINALS_CLI_ALLOW_NON_LOCAL_ENV = 'TERMINALS_CLI_ALLOW_NON_LOCAL';

function assertTerminalWriteTargetAllowed(scriptName: string) {
    assertScriptDbWriteTargetAllowed({
        scriptName,
        connectionString: process.env.DATABASE_URL,
        allowNonLocalEnv: TERMINALS_CLI_ALLOW_NON_LOCAL_ENV,
    });
}

program
    .name('terminals-cli')
    .description('Farmacias Vallenar Suit - Terminal Management CLI')
    .version('1.0.0');

// --- HELPER: FORMATTING ---
function formatTable(headers: string[], rows: any[][]) {
    const colWidths = headers.map((h, i) => {
        return Math.max(h.length, ...rows.map(r => String(r[i] || '').length)) + 2;
    });

    const separator = colWidths.map(w => '-'.repeat(w)).join('+');

    const printRow = (row: any[]) => {
        return row.map((cell, i) => String(cell || '').padEnd(colWidths[i])).join('| ');
    };

    console.log(printRow(headers));
    console.log(separator);
    rows.forEach(r => console.log(printRow(r)));
}

// --- COMMAND: STATUS ---
program.command('status')
    .description('Show current status of all terminals')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
        const client = await pool.connect();
        try {
            const res = await client.query(`
        SELECT 
          t.id, 
          t.name, 
          t.status, 
          u.name as cashier, 
          s.id as session_id,
          s.opened_at
        FROM terminals t
        LEFT JOIN users u ON t.current_cashier_id = u.id
        LEFT JOIN cash_register_sessions s ON (s.terminal_id = t.id AND s.status = 'OPEN')
        ORDER BY t.name ASC
      `);

            if (options.json) {
                console.log(JSON.stringify(res.rows, null, 2));
            } else {
                console.log('\n📊 TERMINAL STATUS SNAPSHOT\n');
                const rows = res.rows.map(r => [
                    r.name,
                    r.status,
                    r.status === 'OPEN' ? '🟢' : '🔴',
                    r.cashier || '(None)',
                    r.session_id ? '✅ Active' : (r.status === 'OPEN' ? '❌ MISSING (Zombie?)' : '-'),
                    r.opened_at ? new Date(r.opened_at).toLocaleString() : '-'
                ]);
                formatTable(['Name', 'Status', 'Icon', 'Cashier', 'Session Integrity', 'Opened At'], rows);
                console.log(`\nTotal Terminals: ${res.rowCount}`);
            }
        } catch (e) {
            console.error('Error fetching status:', e);
        } finally {
            client.release();
            process.exit(0);
        }
    });

// --- COMMAND: HEALTH ---
program.command('health')
    .description('Diagnose integrity issues (Zombies, Orphan Sessions)')
    .action(async () => {
        const client = await pool.connect();
        try {
            console.log('🩺 RUNNING HEALTH CHECKS...\n');
            let issuesFound = 0;

            // Check 1: Zombies (Terminal OPEN but no Session)
            const zombies = await client.query(`
        SELECT t.id, t.name, t.current_cashier_id 
        FROM terminals t
        LEFT JOIN cash_register_sessions s ON (s.terminal_id = t.id AND s.closed_at IS NULL)
        WHERE t.status = 'OPEN' AND s.id IS NULL
      `);

            if (zombies.rows.length > 0) {
                console.log('❌ [CRITICAL] ZOMBIE TERMINALS DETECTED (Status OPEN but no active session):');
                zombies.rows.forEach(r => console.log(`   - ${r.name} (${r.id})`));
                issuesFound += zombies.rows.length;
                console.log('   -> SUGGESTION: Run "npm run terminals:cleanup" to fix.\n');
            } else {
                console.log('✅ No Zombie Terminals found.');
            }

            // Check 2: Orphan Sessions (Session OPEN but Terminal CLOSED)
            const orphans = await client.query(`
        SELECT s.id, s.terminal_id, s.user_id, s.opened_at
        FROM cash_register_sessions s
        JOIN terminals t ON s.terminal_id = t.id
        WHERE s.closed_at IS NULL AND t.status = 'CLOSED'
      `);

            if (orphans.rows.length > 0) {
                console.log('❌ [HIGH] ORPHAN SESSIONS DETECTED (Session active but Terminal CLOSED):');
                orphans.rows.forEach(r => console.log(`   - Session ${r.id} on Terminal ${r.terminal_id}`));
                issuesFound += orphans.rows.length;
                console.log('   -> SUGGESTION: Run "npm run terminals:cleanup" to fix.\n');
            } else {
                console.log('✅ No Orphan Sessions found.');
            }

            // Check 3: Foreign Key Constraints Check (Simple query to see if there are bad refs)
            // This usually throws on insert, but we can check if any current_cashier_id points to non-existent user
            const badRefs = await client.query(`
         SELECT t.id, t.name FROM terminals t 
         LEFT JOIN users u ON t.current_cashier_id = u.id 
         WHERE t.current_cashier_id IS NOT NULL AND u.id IS NULL
      `);

            if (badRefs.rows.length > 0) {
                console.log('❌ [CRITICAL] BAD USER REFERENCES (Terminal assigned to ghost user):');
                badRefs.rows.forEach(r => console.log(`   - ${r.name} (${r.id})`));
                issuesFound++;
            } else {
                console.log('✅ User References Integrity OK.');
            }

            console.log('\nSummary:');
            if (issuesFound === 0) {
                console.log('🎉 SYSTEM HEALTHY. No action needed.');
            } else {
                console.log(`⚠️  ${issuesFound} ISSUES DETECTED. Action required.`);
                process.exit(1);
            }

        } catch (e) {
            console.error('Health check failed:', e);
            process.exit(2);
        } finally {
            client.release();
            process.exit(0);
        }
    });

// --- COMMAND: FORCE CLOSE ---
program.command('force-close')
    .description('Force close a specific terminal')
    .argument('<terminalId>', 'ID of the terminal to close')
    .action(async (terminalId) => {
        assertTerminalWriteTargetAllowed('terminals:force-close');
        const client = await pool.connect();
        try {
            console.log(`🔧 FORCE CLOSING TERMINAL: ${terminalId}`);

            await client.query('BEGIN');

            // 1. Close Sessions
            const resSessions = await client.query(`
        UPDATE cash_register_sessions 
        SET closed_at = NOW(), status = 'CLOSED_FORCE', notes = 'Force Closed via CLI'
        WHERE terminal_id = $1 AND closed_at IS NULL
      `, [terminalId]);

            console.log(`   - Closed ${resSessions.rowCount} active sessions.`);

            // 2. Reset Terminal
            const resTerm = await client.query(`
        UPDATE terminals 
        SET status = 'CLOSED', current_cashier_id = NULL
        WHERE id = $1
      `, [terminalId]);

            if (resTerm.rowCount === 0) {
                console.error('   ❌ Terminal ID not found.');
                await client.query('ROLLBACK');
                process.exit(1);
            }

            await client.query('COMMIT');
            console.log('   ✅ Terminal successfully reset to CLOSED state.');

        } catch (e) {
            await client.query('ROLLBACK');
            console.error('Error forcing close:', e);
        } finally {
            client.release();
            process.exit(0);
        }
    });

// --- COMMAND: CLEANUP (AUTO FIX) ---
program.command('cleanup')
    .description('Auto-fix common issues (Zombies & Orphans)')
    .action(async () => {
        assertTerminalWriteTargetAllowed('terminals:cleanup');
        const client = await pool.connect();
        try {
            console.log('🧹 STARTING AUTO-CLEANUP...');
            await client.query('BEGIN');

            // 1. Fix Zombies: Reset terminals that are OPEN but have no session
            const fixZombies = await client.query(`
        UPDATE terminals t
        SET status = 'CLOSED', current_cashier_id = NULL
        WHERE t.status = 'OPEN' 
        AND NOT EXISTS (
            SELECT 1 FROM cash_register_sessions s 
            WHERE s.terminal_id = t.id AND s.closed_at IS NULL
        )
      `);
            console.log(`   - Fixed ${fixZombies.rowCount} Zombie Terminals (Reset to CLOSED).`);

            // 2. Fix Orphans: Close sessions that are OPEN but terminal is CLOSED
            const fixOrphans = await client.query(`
        UPDATE cash_register_sessions s
        SET closed_at = NOW(), status = 'CLOSED_AUTO', notes = 'Auto-closed: Terminal was OFF'
        WHERE s.closed_at IS NULL
        AND EXISTS (
             SELECT 1 FROM terminals t 
             WHERE t.id = s.terminal_id AND t.status = 'CLOSED'
        )
      `);
            console.log(`   - Closed ${fixOrphans.rowCount} Orphan Sessions.`);

            await client.query('COMMIT');
            console.log('✅ Cleanup completed successfully.');

        } catch (e) {
            await client.query('ROLLBACK');
            console.error('Cleanup failed:', e);
        } finally {
            client.release();
            process.exit(0);
        }
    });

program.parse();
