#!/usr/bin/env npx ts-node
/**
 * ============================================================================
 * PIN MIGRATION SCRIPT: Plaintext to bcrypt
 * Pharma-Synapse v3.1 - Security Migration
 * ============================================================================
 * 
 * USAGE:
 *   npx ts-node src/scripts/migrate-pins-to-bcrypt.ts
 *   or
 *   npm run migrate:pins
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
 * SAFETY:
 *   - Runs in transaction (all or nothing)
 *   - Can be run multiple times (idempotent)
 *   - Skips already migrated users
 */

import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;

interface MigrationResult {
    total: number;
    migrated: number;
    skipped: number;
    errors: string[];
}

async function migratePins(): Promise<MigrationResult> {
    const result: MigrationResult = {
        total: 0,
        migrated: 0,
        skipped: 0,
        errors: []
    };

    // Initialize database connection
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    const client = await pool.connect();

    try {
        console.log('🔐 PIN Migration Script - Starting...\n');

        // Check if access_pin_hash column exists
        const columnCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'access_pin_hash'
        `);

        if (columnCheck.rowCount === 0) {
            console.log('⚠️  Column access_pin_hash does not exist. Creating...');
            await client.query(`
                ALTER TABLE users ADD COLUMN IF NOT EXISTS access_pin_hash VARCHAR(60)
            `);
            console.log('✅ Column created successfully.\n');
        }

        // Start transaction
        await client.query('BEGIN');

        // Find users with plaintext PINs
        const usersRes = await client.query(`
            SELECT id, name, access_pin, access_pin_hash
            FROM users
            WHERE access_pin IS NOT NULL
            ORDER BY name
        `);

        result.total = usersRes.rowCount || 0;
        console.log(`📊 Found ${result.total} users with plaintext PINs\n`);

        if (result.total === 0) {
            console.log('✅ No users require migration. All PINs are already secured.\n');
            await client.query('COMMIT');
            return result;
        }

        // Process each user
        for (const user of usersRes.rows) {
            try {
                // Skip if already has hash
                if (user.access_pin_hash) {
                    console.log(`⏭️  Skipping ${user.name} (ID: ${user.id}) - Already migrated`);
                    result.skipped++;
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

                console.log(`✅ Migrated ${user.name} (ID: ${user.id})`);
                result.migrated++;

            } catch (userError: any) {
                const errorMsg = `Failed to migrate ${user.name} (${user.id}): ${userError.message}`;
                console.error(`❌ ${errorMsg}`);
                result.errors.push(errorMsg);
            }
        }

        // Log audit entry
        await client.query(`
            INSERT INTO audit_logs (user_id, action, details, ip_address, timestamp)
            VALUES (NULL, 'SECURITY_PIN_MIGRATION', $1, 'system', NOW())
        `, [JSON.stringify({
            total: result.total,
            migrated: result.migrated,
            skipped: result.skipped,
            errors: result.errors.length
        })]);

        // Commit transaction
        await client.query('COMMIT');
        console.log('\n✅ Transaction committed successfully.\n');

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
    console.log('📋 MIGRATION SUMMARY');
    console.log('═'.repeat(50));
    console.log(`   Total users with PINs: ${result.total}`);
    console.log(`   Successfully migrated: ${result.migrated}`);
    console.log(`   Skipped (already done): ${result.skipped}`);
    console.log(`   Errors: ${result.errors.length}`);
    console.log('═'.repeat(50));

    if (result.errors.length > 0) {
        console.log('\n⚠️  ERRORS:');
        result.errors.forEach((err, i) => console.log(`   ${i + 1}. ${err}`));
    }

    if (result.migrated > 0) {
        console.log('\n🎉 Migration completed successfully!');
        console.log('   Users can now log in with their existing PINs.');
        console.log('   Plaintext PINs have been removed from the database.');
    }
}

// Main execution
async function main(): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('🔐 PHARMA-SYNAPSE v3.1 - PIN SECURITY MIGRATION');
    console.log('='.repeat(60) + '\n');

    const result = await migratePins();
    printSummary(result);

    // Exit with error code if there were failures
    if (result.errors.length > 0) {
        process.exit(1);
    }
}

// Run
main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
