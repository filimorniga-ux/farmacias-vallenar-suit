import { Pool } from 'pg';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

function buildMigrationConnectionString(): string {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        throw new Error('DATABASE_URL no está configurada');
    }

    try {
        const parsed = new URL(databaseUrl);
        if (parsed.port === '6543') {
            parsed.port = '5432';
        }

        parsed.searchParams.delete('pgbouncer');
        parsed.searchParams.delete('connection_limit');
        return parsed.toString();
    } catch {
        return databaseUrl
            .replace(':6543', ':5432')
            .replace(/([?&])pgbouncer=true(&)?/, (_, prefix: string, suffix: string) => (suffix ? prefix : ''))
            .replace(/([?&])connection_limit=\d+(&)?/, (_, prefix: string, suffix: string) => (suffix ? prefix : ''))
            .replace(/[?&]$/, '');
    }
}

async function runMigrations() {
    const cliMigrations = process.argv.slice(2).map((file) => file.trim()).filter(Boolean);
    const defaultMigrations = [
        '020_fix_batch_product_canonicalization.sql',
        '021_fix_batch_product_barcode_fallback.sql',
        '022_secure_maintenance_backup_tables.sql',
        '023_fix_audit_log_functions_schema_qualified.sql',
        '024_purchase_order_review_flow.sql',
    ];
    const migrations = cliMigrations.length > 0 ? cliMigrations : defaultMigrations;
    const migrationConnectionString = buildMigrationConnectionString();
    const migrationPool = new Pool({
        connectionString: migrationConnectionString,
        ssl: { rejectUnauthorized: false },
        max: 1,
        connectionTimeoutMillis: 15000,
        idleTimeoutMillis: 15000,
    });

    console.log('🚀 Starting migration execution...');
    console.log(`📦 Migration set: ${migrations.join(', ')}`);
    try {
        const parsed = new URL(migrationConnectionString);
        console.log(`🔌 DB target for migrations: ${parsed.hostname}:${parsed.port || '5432'}`);
    } catch {
        console.log('🔌 DB target for migrations: <unable to parse connection string>');
    }

    const client = await migrationPool.connect();
    client.on('notice', (msg) => console.log(`NOTICE: ${msg.message}`));

    try {
        for (const file of migrations) {
            const filePath = path.join(process.cwd(), 'src/db/migrations', file);
            console.log(`\n📄 Reading migration: ${file}`);

            if (!fs.existsSync(filePath)) {
                throw new Error(`Migration file not found: ${filePath}`);
            }

            const sql = fs.readFileSync(filePath, 'utf-8');
            console.log(`▶️ Executing ${file}...`);

            try {
                // Determine if we need to wrap in transaction manually or if file has it
                // These files have explicit BEGIN/COMMIT, so we execute as is.
                await client.query(sql);
                console.log(`✅ Success: ${file}`);
            } catch (err: unknown) {
                console.error(`❌ Failed: ${file}`);
                console.error(err instanceof Error ? err.message : String(err));
                throw err;
            }
        }

        console.log('\n🎉 All migrations executed successfully.');
    } catch (err: unknown) {
        console.error('Fatal error during migration:', err);
        throw err;
    } finally {
        client.release();
        await migrationPool.end();
    }
}

runMigrations().catch(() => process.exit(1));
