import * as dotenv from 'dotenv';
import { redactConnectionString } from '../src/scripts/e2e-release-critical-db-policy';
import {
    SCRIPT_DB_NON_LOCAL_CONFIRMATION,
    assertScriptDbWriteTargetAllowed,
} from '../src/scripts/script-db-target-policy';

dotenv.config({ path: '.env.local' });

const VERIFY_PINS_ALLOW_NON_LOCAL_ENV = 'VERIFY_PINS_ALLOW_NON_LOCAL';
const VERIFY_PINS_RESET_CONFIRM_ENV = 'VERIFY_PINS_RESET_CONFIRM';
const VERIFY_PINS_RESET_CONFIRMATION = 'RESET_PIN_1213';
const databaseUrl = process.env.DATABASE_URL;

type PinAuditUser = {
    name: string;
    role: string;
    access_pin: string | null;
};

console.log('DEBUG: DATABASE_URL is:', databaseUrl ? 'SET' : 'UNSET');
if (databaseUrl) {
    console.log('DEBUG: DB target:', redactConnectionString(databaseUrl));
}
// import { pool } from '../src/lib/db'; // Removed static import

async function checkPins() {
    // Dynamic import to ensure env vars are loaded first
    const { pool } = await import('../src/lib/db');

    try {
        console.log('🔍 Checking users in DB...');
        const res = await pool.query('SELECT name, role, access_pin FROM users');
        const users = res.rows as PinAuditUser[];

        console.table(users.map(user => ({
            name: user.name,
            role: user.role,
            pin_status: user.access_pin === '1213' ? 'EXPECTED_DEV_PIN' : 'DIFFERENT_OR_EMPTY',
        })));

        const needsUpdate = users.some(user => user.access_pin !== '1213');
        if (needsUpdate) {
            if (process.env[VERIFY_PINS_RESET_CONFIRM_ENV] !== VERIFY_PINS_RESET_CONFIRMATION) {
                console.warn(
                    `⚠️ Some users do NOT have the controlled dev PIN. ` +
                    `No changes were made. To reset, define ${VERIFY_PINS_RESET_CONFIRM_ENV}=${VERIFY_PINS_RESET_CONFIRMATION}.`
                );
                return;
            }

            assertScriptDbWriteTargetAllowed({
                scriptName: 'verify_pins',
                connectionString: databaseUrl,
                allowNonLocalEnv: VERIFY_PINS_ALLOW_NON_LOCAL_ENV,
            });

            console.log(
                `⚠️ Resetting user PINs to the controlled dev value. ` +
                `Non-local targets require ${VERIFY_PINS_ALLOW_NON_LOCAL_ENV}=${SCRIPT_DB_NON_LOCAL_CONFIRMATION}.`
            );
            await pool.query("UPDATE users SET access_pin = '1213'");
            console.log('✅ All users updated to PIN 1213');
        } else {
            console.log('✅ All users already have PIN 1213');
        }
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await pool.end();
    }
}

checkPins();
