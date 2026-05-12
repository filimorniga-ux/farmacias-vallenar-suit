#!/usr/bin/env npx ts-node
/**
 * ============================================================================
 * PIN MIGRATION SCRIPT: Plaintext to bcrypt (Enhanced with Dry Run)
 * Pharma-Synapse v3.1 - Security Migration
 * ============================================================================
 * 
 * USAGE:
 *   # Dry run (preview changes without modifying database):
 *   npx tsx src/scripts/migrate-pins-to-bcrypt.ts --dry-run
 *   
 *   # Actual migration:
 *   npx tsx src/scripts/migrate-pins-to-bcrypt.ts
 *   
 *   # With npm script:
 *   npm run migrate:pins          # Actual migration
 *   npm run migrate:pins:preview  # Dry run
 * 
 * PREREQUISITES:
 *   1. Database must be accessible
 *   2. users table must have access_pin_hash column:
 *      ALTER TABLE users ADD COLUMN IF NOT EXISTS access_pin_hash VARCHAR(60);
 * 
 * WHAT IT DOES:
 *   1. Finds all users with plaintext PINs (access_pin IS NOT NULL)
 *   2. Hashes each PIN with bcrypt (10 rounds)
 *   3. Stores hash in access_pin_hash
 *   4. Clears plaintext access_pin
 *   5. Logs progress and results
 * 
 * SAFETY FEATURES:
 *   - DRY RUN mode: Preview changes without modifying database
 *   - Runs in transaction (all or nothing)
 *   - Can be run multiple times (idempotent)
 *   - Skips already migrated users
 *   - Validates hashes after migration
 *   - Creates backup before migration
 * 
 * ROLLBACK:
 *   If migration fails mid-way, transaction is rolled back automatically.
 *   To manually restore from backup table:
 *   UPDATE users u SET access_pin = b.access_pin, access_pin_hash = NULL
 *   FROM users_pin_backup b WHERE u.id = b.user_id;
 */

// Load environment variables from .env file
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from project root
config({ path: resolve(process.cwd(), '.env') });

import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { assertScriptDbWriteTargetAllowed } from './script-db-target-policy';

const BCRYPT_ROUNDS = 10;
const MIGRATE_PINS_ALLOW_NON_LOCAL_ENV = 'MIGRATE_PINS_ALLOW_NON_LOCAL';

interface MigrationResult {
    total: number;
    migrated: number;
    skipped: number;
    errors: string[];
    validated: number;
    dryRun: boolean;
}

interface UserToMigrate {
    id: string;
    name: string;
    access_pin: string;
    access_pin_hash: string | null;
}

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run') || args.includes('-d');
const VERBOSE = args.includes('--verbose') || args.includes('-v');

function isLocalConnectionString(value: string) {
    try {
        const parsed = new URL(value);
        return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';
    } catch {
        return value.includes('localhost') || value.includes('127.0.0.1');
    }
}

function resolveMigrationConnectionString() {
    const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!connectionString) {
        throw new Error('POSTGRES_URL_NON_POOLING, DATABASE_URL o POSTGRES_URL requerido para migrate:pins');
    }

    if (!DRY_RUN) {
        assertScriptDbWriteTargetAllowed({
            scriptName: 'migrate:pins',
            connectionString,
            allowNonLocalEnv: MIGRATE_PINS_ALLOW_NON_LOCAL_ENV,
        });
    }

    return connectionString;
}

async function migratePins(): Promise<MigrationResult> {
    const result: MigrationResult = {
        total: 0,
        migrated: 0,
        skipped: 0,
        errors: [],
        validated: 0,
        dryRun: DRY_RUN
    };

    // Initialize database connection
    const connectionString = resolveMigrationConnectionString();
    const pool = new Pool({
        connectionString,
        ssl: isLocalConnectionString(connectionString) ? false : { rejectUnauthorized: false }
    });

    const client = await pool.connect();

    try {
        console.log('🔐 PIN Migration Script - Starting...');
        console.log(DRY_RUN ? '⚠️  DRY RUN MODE - No changes will be made\n' : '\n');

        // Check if access_pin_hash column exists
        const columnCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'access_pin_hash'
        `);

        if (columnCheck.rowCount === 0) {
            console.log('⚠️  Column access_pin_hash does not exist.');
            if (!DRY_RUN) {
                console.log('    Creating column...');
                await client.query(`
                    ALTER TABLE users ADD COLUMN IF NOT EXISTS access_pin_hash VARCHAR(60)
                `);
                console.log('✅ Column created successfully.\n');
            } else {
                console.log('    [DRY RUN] Would create column access_pin_hash\n');
            }
        }

        // Start transaction (even for dry run, we'll rollback at the end)
        await client.query('BEGIN');

        // Find users with plaintext PINs
        const usersRes = await client.query<UserToMigrate>(`
            SELECT id, name, access_pin, access_pin_hash
            FROM users
            WHERE access_pin IS NOT NULL
            ORDER BY name
        `);

        result.total = usersRes.rowCount || 0;
        console.log(`📊 Found ${result.total} users with plaintext PINs\n`);

        if (result.total === 0) {
            console.log('✅ No users require migration. All PINs are already secured.\n');
            await client.query(DRY_RUN ? 'ROLLBACK' : 'COMMIT');
            return result;
        }

        // Create backup table (only in actual run)
        if (!DRY_RUN) {
            console.log('📦 Creating backup of current PINs...');
            await client.query(`
                CREATE TABLE IF NOT EXISTS users_pin_backup (
                    user_id VARCHAR(36) PRIMARY KEY,
                    access_pin VARCHAR(20),
                    backed_up_at TIMESTAMPTZ DEFAULT NOW()
                )
            `);
            await client.query(`
                INSERT INTO users_pin_backup (user_id, access_pin)
                SELECT id, access_pin FROM users WHERE access_pin IS NOT NULL
                ON CONFLICT (user_id) DO UPDATE SET 
                    access_pin = EXCLUDED.access_pin,
                    backed_up_at = NOW()
            `);
            console.log('✅ Backup created in users_pin_backup table.\n');
        } else {
            console.log('[DRY RUN] Would create backup in users_pin_backup table\n');
        }

        // Preview section for dry run
        if (DRY_RUN) {
            console.log('═'.repeat(60));
            console.log('📋 USERS TO BE MIGRATED (Preview):');
            console.log('═'.repeat(60));
            console.log(`${'NAME'.padEnd(30)} | ${'ID'.padEnd(36)} | STATUS`);
            console.log('─'.repeat(60));
        }

        // Process each user
        const usersToMigrate: UserToMigrate[] = [];
        
        for (const user of usersRes.rows) {
            try {
                // Skip if already has hash
                if (user.access_pin_hash) {
                    if (VERBOSE || DRY_RUN) {
                        console.log(`⏭️  ${user.name.padEnd(30)} | ${user.id} | Already migrated`);
                    }
                    result.skipped++;
                    continue;
                }

                if (DRY_RUN) {
                    console.log(`🔄 ${user.name.padEnd(30)} | ${user.id} | Will migrate`);
                    usersToMigrate.push(user);
                    result.migrated++;
                    continue;
                }

                // Hash the PIN
                const hashedPin = await bcrypt.hash(user.access_pin, BCRYPT_ROUNDS);

                // Update user
                await client.query(`
                    UPDATE users 
                    SET access_pin_hash = $1,
                        access_pin = NULL
                    WHERE id = $2
                `, [hashedPin, user.id]);

                // Validate the hash immediately
                const isValid = await bcrypt.compare(user.access_pin, hashedPin);
                if (!isValid) {
                    throw new Error('Hash validation failed');
                }
                result.validated++;

                if (VERBOSE) {
                    console.log(`✅ Migrated ${user.name} (ID: ${user.id})`);
                }
                result.migrated++;

            } catch (userError: any) {
                const errorMsg = `Failed to migrate ${user.name} (${user.id}): ${userError.message}`;
                console.error(`❌ ${errorMsg}`);
                result.errors.push(errorMsg);
            }
        }

        if (DRY_RUN) {
            console.log('═'.repeat(60));
            console.log('\n⚠️  DRY RUN COMPLETE - No changes were made.');
            console.log('    Run without --dry-run to apply migration.\n');
            await client.query('ROLLBACK');
            return result;
        }

        // Log audit entry
        try {
            await client.query(`
                INSERT INTO audit_logs (user_id, action, details, ip_address, timestamp)
                VALUES (NULL, 'SECURITY_PIN_MIGRATION', $1, 'system', NOW())
            `, [JSON.stringify({
                total: result.total,
                migrated: result.migrated,
                skipped: result.skipped,
                validated: result.validated,
                errors: result.errors.length
            })]);
        } catch (auditErr) {
            // Audit table might not exist, log but continue
            console.warn('⚠️  Could not write to audit_logs (table may not exist)');
        }

        // Commit transaction
        if (result.errors.length === 0) {
            await client.query('COMMIT');
            console.log('\n✅ Transaction committed successfully.\n');
        } else {
            // Rollback if there were any errors
            await client.query('ROLLBACK');
            console.log('\n⚠️  Errors occurred. Transaction rolled back.');
            console.log('    No changes were made to the database.\n');
        }

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('\n❌ Migration failed. Transaction rolled back.');
        console.error('Error:', error.message);
        result.errors.push(`Transaction failed: ${error.message}`);
    } finally {
        client.release();
        await pool.end();
    }

    return result;
}

// Summary output
function printSummary(result: MigrationResult): void {
    console.log('═'.repeat(50));
    console.log(result.dryRun ? '📋 DRY RUN SUMMARY' : '📋 MIGRATION SUMMARY');
    console.log('═'.repeat(50));
    console.log(`   Total users with PINs: ${result.total}`);
    console.log(`   ${result.dryRun ? 'Would migrate' : 'Successfully migrated'}: ${result.migrated}`);
    console.log(`   Skipped (already done): ${result.skipped}`);
    if (!result.dryRun) {
        console.log(`   Validated hashes: ${result.validated}`);
    }
    console.log(`   Errors: ${result.errors.length}`);
    console.log('═'.repeat(50));

    if (result.errors.length > 0) {
        console.log('\n⚠️  ERRORS:');
        result.errors.forEach((err, i) => console.log(`   ${i + 1}. ${err}`));
    }

    if (!result.dryRun && result.migrated > 0 && result.errors.length === 0) {
        console.log('\n🎉 Migration completed successfully!');
        console.log('   Users can now log in with their existing PINs.');
        console.log('   Plaintext PINs have been removed from the database.');
        console.log('\n📦 BACKUP: PINs backed up to users_pin_backup table.');
        console.log('   To restore if needed:');
        console.log('   UPDATE users u SET access_pin = b.access_pin, access_pin_hash = NULL');
        console.log('   FROM users_pin_backup b WHERE u.id = b.user_id;');
    }

    if (result.dryRun && result.migrated > 0) {
        console.log('\n➡️  To apply this migration, run:');
        console.log('   npx ts-node src/scripts/migrate-pins-to-bcrypt.ts');
    }
}

// Help output
function printHelp(): void {
    console.log(`
PIN Migration Script - Migrate plaintext PINs to bcrypt hashes

USAGE:
  npx ts-node src/scripts/migrate-pins-to-bcrypt.ts [OPTIONS]

OPTIONS:
  --dry-run, -d    Preview changes without modifying database
  --verbose, -v    Show detailed output for each user
  --help, -h       Show this help message

EXAMPLES:
  # Preview what would be migrated:
  npx ts-node src/scripts/migrate-pins-to-bcrypt.ts --dry-run

  # Run actual migration:
  npx ts-node src/scripts/migrate-pins-to-bcrypt.ts

  # Run with verbose output:
  npx ts-node src/scripts/migrate-pins-to-bcrypt.ts --verbose
`);
}

// Main execution
async function main(): Promise<void> {
    if (args.includes('--help') || args.includes('-h')) {
        printHelp();
        return;
    }

    console.log('\n' + '='.repeat(60));
    console.log('🔐 PHARMA-SYNAPSE v3.1 - PIN SECURITY MIGRATION');
    if (DRY_RUN) {
        console.log('⚠️  MODE: DRY RUN (No changes will be made)');
    }
    console.log('='.repeat(60) + '\n');

    const result = await migratePins();
    printSummary(result);

    // Exit with error code if there were failures (only in actual run)
    if (!result.dryRun && result.errors.length > 0) {
        process.exit(1);
    }
}

// Run
main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
