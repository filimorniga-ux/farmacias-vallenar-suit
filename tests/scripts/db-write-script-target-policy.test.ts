import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const runMigrationsPath = path.join(process.cwd(), 'src', 'scripts', 'run-migrations.ts');
const preparePredeployCiDbPath = path.join(process.cwd(), 'src', 'scripts', 'prepare-predeploy-ci-db.ts');
const verifyPinsPath = path.join(process.cwd(), 'scripts', 'verify_pins.ts');
const truncateDbPath = path.join(process.cwd(), 'scripts', 'truncate_db.ts');
const reimportV2Path = path.join(process.cwd(), 'scripts', 'reimport_v2.ts');
const fastCleanupPath = path.join(process.cwd(), 'scripts', 'fast_cleanup.ts');
const enrichAndCleanupIspPath = path.join(process.cwd(), 'scripts', 'enrich_and_cleanup_isp.ts');
const updateBioequivalentsPath = path.join(process.cwd(), 'scripts', 'update_bioequivalents.ts');
const markDuplicatesSafePath = path.join(process.cwd(), 'scripts', 'mark_duplicates_safe.ts');
const importMasterInventoryPath = path.join(process.cwd(), 'scripts', 'import_master_inventory.ts');
const dbScriptPath = path.join(process.cwd(), 'scripts', 'db_script.ts');
const enrichFilesPath = path.join(process.cwd(), 'scripts', 'enrich_files.ts');
const initDbPath = path.join(process.cwd(), 'scripts', 'init-db.js');
const runMigration023Path = path.join(process.cwd(), 'scripts', 'run-migration.ts');
const runEnrichedProductMigrationPath = path.join(process.cwd(), 'scripts', 'run_migration.ts');
const runLegacyInitSqlPath = path.join(process.cwd(), 'scripts', 'run_migrations.ts');
const runMasterImportPath = path.join(process.cwd(), 'scripts', 'run_master_import.ts');
const legacyDbScriptGuardPath = path.join(process.cwd(), 'scripts', 'legacy-db-script-guard.cjs');
const applyProductsMigrationPath = path.join(process.cwd(), 'scripts', 'apply-products-migration.cjs');
const applyReciboMigrationPath = path.join(process.cwd(), 'scripts', 'apply-recibo-migration.cjs');
const runFuzzyMigrationPath = path.join(process.cwd(), 'scripts', 'run-fuzzy-migration.cjs');
const ensureDevAccountPath = path.join(process.cwd(), 'src', 'scripts', 'ensure-dev-gerente-general.ts');
const disableDevAccountPath = path.join(process.cwd(), 'src', 'scripts', 'disable-dev-gerente-general.ts');
const migratePinsPath = path.join(process.cwd(), 'src', 'scripts', 'migrate-pins-to-bcrypt.ts');

describe('db write scripts target policy usage', () => {
    it('guards run-migrations before rewriting pooler-style connection strings', () => {
        const script = fs.readFileSync(runMigrationsPath, 'utf8');

        expect(script).toContain("import { assertScriptDbWriteTargetAllowed } from './script-db-target-policy'");
        expect(script).toContain("allowNonLocalEnv: 'RUN_MIGRATIONS_ALLOW_NON_LOCAL'");
        expect(script.indexOf('assertScriptDbWriteTargetAllowed({'))
            .toBeLessThan(script.indexOf("parsed.searchParams.delete('pgbouncer')"));
    });

    it('guards prepare-predeploy-ci-db before connecting to DATABASE_URL', () => {
        const script = fs.readFileSync(preparePredeployCiDbPath, 'utf8');

        expect(script).toContain("import { assertScriptDbWriteTargetAllowed } from './script-db-target-policy'");
        expect(script).toContain("allowNonLocalEnv: 'PREDEPLOY_CI_DB_ALLOW_NON_LOCAL'");
        expect(script.indexOf('assertScriptDbWriteTargetAllowed({'))
            .toBeLessThan(script.indexOf('return databaseUrl'));
    });

    it('keeps verify_pins read-only by default and redacts DB/PIN output', () => {
        const script = fs.readFileSync(verifyPinsPath, 'utf8');

        expect(script).toContain("import { redactConnectionString } from '../src/scripts/e2e-release-critical-db-policy'");
        expect(script).toContain("import {\n    SCRIPT_DB_NON_LOCAL_CONFIRMATION,\n    assertScriptDbWriteTargetAllowed,\n} from '../src/scripts/script-db-target-policy'");
        expect(script).toContain("const VERIFY_PINS_ALLOW_NON_LOCAL_ENV = 'VERIFY_PINS_ALLOW_NON_LOCAL'");
        expect(script).toContain("const VERIFY_PINS_RESET_CONFIRM_ENV = 'VERIFY_PINS_RESET_CONFIRM'");
        expect(script).toContain("const VERIFY_PINS_RESET_CONFIRMATION = 'RESET_PIN_1213'");
        expect(script).toContain('redactConnectionString(databaseUrl)');
        expect(script).toContain("pin_status: user.access_pin === '1213' ? 'EXPECTED_DEV_PIN' : 'DIFFERENT_OR_EMPTY'");
        expect(script).not.toContain("console.log('DEBUG: Connection String:', process.env.DATABASE_URL)");

        const confirmationIndex = script.indexOf(`process.env[VERIFY_PINS_RESET_CONFIRM_ENV] !== VERIFY_PINS_RESET_CONFIRMATION`);
        const policyIndex = script.indexOf('assertScriptDbWriteTargetAllowed({');
        const updateIndex = script.indexOf("UPDATE users SET access_pin = '1213'");

        expect(confirmationIndex).toBeGreaterThan(-1);
        expect(policyIndex).toBeGreaterThan(confirmationIndex);
        expect(updateIndex).toBeGreaterThan(policyIndex);
    });

    it('guards truncate_db before opening a destructive inventory connection', () => {
        const script = fs.readFileSync(truncateDbPath, 'utf8');

        expect(script).toContain("import { redactConnectionString } from '../src/scripts/e2e-release-critical-db-policy'");
        expect(script).toContain("import { assertScriptDbWriteTargetAllowed } from '../src/scripts/script-db-target-policy'");
        expect(script).toContain("const TRUNCATE_DB_ALLOW_NON_LOCAL_ENV = 'TRUNCATE_DB_ALLOW_NON_LOCAL'");
        expect(script).toContain("const TRUNCATE_DB_CONFIRM_ENV = 'TRUNCATE_DB_CONFIRM'");
        expect(script).toContain("const TRUNCATE_DB_CONFIRMATION = 'TRUNCATE_INVENTORY_TABLES'");
        expect(script).toContain('redactConnectionString(dbUrl)');

        const confirmationIndex = script.indexOf(`process.env[TRUNCATE_DB_CONFIRM_ENV] !== TRUNCATE_DB_CONFIRMATION`);
        const policyIndex = script.indexOf('assertScriptDbWriteTargetAllowed({');
        const poolIndex = script.indexOf('const pool = new Pool({');
        const truncateIndex = script.indexOf('TRUNCATE TABLE lotes, productos RESTART IDENTITY CASCADE;');

        expect(confirmationIndex).toBeGreaterThan(-1);
        expect(policyIndex).toBeGreaterThan(confirmationIndex);
        expect(poolIndex).toBeGreaterThan(policyIndex);
        expect(truncateIndex).toBeGreaterThan(poolIndex);
    });

    it('guards reimport_v2 before wiping products and inventory batches', () => {
        const script = fs.readFileSync(reimportV2Path, 'utf8');

        expect(script).toContain("import { redactConnectionString } from '../src/scripts/e2e-release-critical-db-policy'");
        expect(script).toContain("import { assertScriptDbWriteTargetAllowed } from '../src/scripts/script-db-target-policy'");
        expect(script).toContain("const REIMPORT_V2_ALLOW_NON_LOCAL_ENV = 'REIMPORT_V2_ALLOW_NON_LOCAL'");
        expect(script).toContain("const REIMPORT_V2_CONFIRM_ENV = 'REIMPORT_V2_CONFIRM'");
        expect(script).toContain("const REIMPORT_V2_CONFIRMATION = 'REIMPORT_V2_INVENTORY'");
        expect(script).toContain('redactConnectionString(DB_URL)');

        const confirmationIndex = script.indexOf(`process.env[REIMPORT_V2_CONFIRM_ENV] !== REIMPORT_V2_CONFIRMATION`);
        const policyIndex = script.indexOf('assertScriptDbWriteTargetAllowed({');
        const poolIndex = script.indexOf('const pool = new Pool({');
        const truncateIndex = script.indexOf('TRUNCATE TABLE products, inventory_batches CASCADE');

        expect(confirmationIndex).toBeGreaterThan(-1);
        expect(policyIndex).toBeGreaterThan(confirmationIndex);
        expect(poolIndex).toBeGreaterThan(policyIndex);
        expect(truncateIndex).toBeGreaterThan(poolIndex);
    });

    it('guards fast_cleanup before deleting nameless ISP products', () => {
        const script = fs.readFileSync(fastCleanupPath, 'utf8');

        expect(script).toContain("import { redactConnectionString } from '../src/scripts/e2e-release-critical-db-policy'");
        expect(script).toContain("import { assertScriptDbWriteTargetAllowed } from '../src/scripts/script-db-target-policy'");
        expect(script).toContain("const FAST_CLEANUP_ALLOW_NON_LOCAL_ENV = 'FAST_CLEANUP_ALLOW_NON_LOCAL'");
        expect(script).toContain("const FAST_CLEANUP_CONFIRM_ENV = 'FAST_CLEANUP_CONFIRM'");
        expect(script).toContain("const FAST_CLEANUP_CONFIRMATION = 'DELETE_NAMELESS_ISP_PRODUCTS'");
        expect(script).toContain('redactConnectionString(dbUrl)');

        const confirmationIndex = script.indexOf(`process.env[FAST_CLEANUP_CONFIRM_ENV] !== FAST_CLEANUP_CONFIRMATION`);
        const policyIndex = script.indexOf('assertScriptDbWriteTargetAllowed({');
        const poolIndex = script.indexOf('const pool = new Pool({');
        const deleteIndex = script.indexOf('DELETE FROM products');

        expect(confirmationIndex).toBeGreaterThan(-1);
        expect(policyIndex).toBeGreaterThan(confirmationIndex);
        expect(poolIndex).toBeGreaterThan(policyIndex);
        expect(deleteIndex).toBeGreaterThan(poolIndex);
    });

    it('guards enrich_and_cleanup_isp before updating or deleting products', () => {
        const script = fs.readFileSync(enrichAndCleanupIspPath, 'utf8');

        expect(script).toContain("import { redactConnectionString } from '../src/scripts/e2e-release-critical-db-policy'");
        expect(script).toContain("import { assertScriptDbWriteTargetAllowed } from '../src/scripts/script-db-target-policy'");
        expect(script).toContain("const ISP_ENRICH_CLEANUP_ALLOW_NON_LOCAL_ENV = 'ISP_ENRICH_CLEANUP_ALLOW_NON_LOCAL'");
        expect(script).toContain("const ISP_ENRICH_CLEANUP_CONFIRM_ENV = 'ISP_ENRICH_CLEANUP_CONFIRM'");
        expect(script).toContain("const ISP_ENRICH_CLEANUP_CONFIRMATION = 'ENRICH_AND_DELETE_NAMELESS_ISP'");
        expect(script).toContain('redactConnectionString(dbUrl)');

        const confirmationIndex = script.indexOf(`process.env[ISP_ENRICH_CLEANUP_CONFIRM_ENV] !== ISP_ENRICH_CLEANUP_CONFIRMATION`);
        const policyIndex = script.indexOf('assertScriptDbWriteTargetAllowed({');
        const poolIndex = script.indexOf('const pool = new Pool({');
        const updateIndex = script.indexOf('UPDATE products');
        const deleteIndex = script.indexOf('DELETE FROM products WHERE id = $1');

        expect(confirmationIndex).toBeGreaterThan(-1);
        expect(policyIndex).toBeGreaterThan(confirmationIndex);
        expect(poolIndex).toBeGreaterThan(policyIndex);
        expect(updateIndex).toBeGreaterThan(poolIndex);
        expect(deleteIndex).toBeGreaterThan(poolIndex);
    });

    it('guards update_bioequivalents before marking product flags from ISP CSV', () => {
        const script = fs.readFileSync(updateBioequivalentsPath, 'utf8');

        expect(script).toContain("import { redactConnectionString } from '../src/scripts/e2e-release-critical-db-policy'");
        expect(script).toContain("import { assertScriptDbWriteTargetAllowed } from '../src/scripts/script-db-target-policy'");
        expect(script).toContain("const UPDATE_BIOEQUIVALENTS_ALLOW_NON_LOCAL_ENV = 'UPDATE_BIOEQUIVALENTS_ALLOW_NON_LOCAL'");
        expect(script).toContain("const UPDATE_BIOEQUIVALENTS_CONFIRM_ENV = 'UPDATE_BIOEQUIVALENTS_CONFIRM'");
        expect(script).toContain("const UPDATE_BIOEQUIVALENTS_CONFIRMATION = 'MARK_BIOEQUIVALENTS_FROM_ISP'");
        expect(script).toContain('redactConnectionString(dbUrl)');

        const confirmationIndex = script.indexOf(`process.env[UPDATE_BIOEQUIVALENTS_CONFIRM_ENV] !== UPDATE_BIOEQUIVALENTS_CONFIRMATION`);
        const policyIndex = script.indexOf('assertScriptDbWriteTargetAllowed({');
        const poolIndex = script.indexOf('const pool = new Pool({');
        const updateIndex = script.indexOf('UPDATE products');

        expect(confirmationIndex).toBeGreaterThan(-1);
        expect(policyIndex).toBeGreaterThan(confirmationIndex);
        expect(poolIndex).toBeGreaterThan(policyIndex);
        expect(updateIndex).toBeGreaterThan(poolIndex);
    });

    it('guards mark_duplicates_safe before renaming duplicate products', () => {
        const script = fs.readFileSync(markDuplicatesSafePath, 'utf8');

        expect(script).toContain("import { redactConnectionString } from '../src/scripts/e2e-release-critical-db-policy'");
        expect(script).toContain("import { assertScriptDbWriteTargetAllowed } from '../src/scripts/script-db-target-policy'");
        expect(script).toContain("const MARK_DUPLICATES_ALLOW_NON_LOCAL_ENV = 'MARK_DUPLICATES_ALLOW_NON_LOCAL'");
        expect(script).toContain("const MARK_DUPLICATES_CONFIRM_ENV = 'MARK_DUPLICATES_CONFIRM'");
        expect(script).toContain("const MARK_DUPLICATES_CONFIRMATION = 'RENAME_DUPLICATE_PRODUCTS'");
        expect(script).toContain('redactConnectionString(dbUrl)');

        const confirmationIndex = script.indexOf(`process.env[MARK_DUPLICATES_CONFIRM_ENV] !== MARK_DUPLICATES_CONFIRMATION`);
        const policyIndex = script.indexOf('assertScriptDbWriteTargetAllowed({');
        const poolIndex = script.indexOf('const pool = new Pool({');
        const updateIndex = script.indexOf('UPDATE products SET name = $1, updated_at = NOW() WHERE id = $2');

        expect(confirmationIndex).toBeGreaterThan(-1);
        expect(policyIndex).toBeGreaterThan(confirmationIndex);
        expect(poolIndex).toBeGreaterThan(policyIndex);
        expect(updateIndex).toBeGreaterThan(poolIndex);
    });

    it('guards import_master_inventory before inserting legacy inventory rows', () => {
        const script = fs.readFileSync(importMasterInventoryPath, 'utf8');

        expect(script).toContain("import { redactConnectionString } from '../src/scripts/e2e-release-critical-db-policy'");
        expect(script).toContain("import { assertScriptDbWriteTargetAllowed } from '../src/scripts/script-db-target-policy'");
        expect(script).toContain("const IMPORT_MASTER_INVENTORY_ALLOW_NON_LOCAL_ENV = 'IMPORT_MASTER_INVENTORY_ALLOW_NON_LOCAL'");
        expect(script).toContain("const IMPORT_MASTER_INVENTORY_CONFIRM_ENV = 'IMPORT_MASTER_INVENTORY_CONFIRM'");
        expect(script).toContain("const IMPORT_MASTER_INVENTORY_CONFIRMATION = 'IMPORT_LEGACY_MASTER_INVENTORY'");
        expect(script).toContain('redactConnectionString(DB_URL)');

        const confirmationIndex = script.indexOf(`process.env[IMPORT_MASTER_INVENTORY_CONFIRM_ENV] !== IMPORT_MASTER_INVENTORY_CONFIRMATION`);
        const policyIndex = script.indexOf('assertScriptDbWriteTargetAllowed({');
        const poolIndex = script.indexOf('const pool = new Pool({');
        const insertIndex = script.indexOf('INSERT INTO productos');

        expect(confirmationIndex).toBeGreaterThan(-1);
        expect(policyIndex).toBeGreaterThan(confirmationIndex);
        expect(poolIndex).toBeGreaterThan(policyIndex);
        expect(insertIndex).toBeGreaterThan(poolIndex);
    });

    it('guards db_script before enrich_files can update products through the helper', () => {
        const helperScript = fs.readFileSync(dbScriptPath, 'utf8');
        const consumerScript = fs.readFileSync(enrichFilesPath, 'utf8');

        expect(consumerScript).toContain("import { query, closePool } from './db_script'");
        expect(consumerScript).toContain('UPDATE products SET');
        expect(helperScript).toContain("import { redactConnectionString } from '../src/scripts/e2e-release-critical-db-policy'");
        expect(helperScript).toContain("import { assertScriptDbWriteTargetAllowed } from '../src/scripts/script-db-target-policy'");
        expect(helperScript).toContain("const DB_SCRIPT_ALLOW_NON_LOCAL_ENV = 'DB_SCRIPT_ALLOW_NON_LOCAL'");
        expect(helperScript).toContain("const DB_SCRIPT_WRITE_CONFIRM_ENV = 'DB_SCRIPT_WRITE_CONFIRM'");
        expect(helperScript).toContain("const DB_SCRIPT_WRITE_CONFIRMATION = 'ALLOW_DB_SCRIPT_WRITES'");
        expect(helperScript).toContain('redactConnectionString(connectionString)');

        const confirmationIndex = helperScript.indexOf(`process.env[DB_SCRIPT_WRITE_CONFIRM_ENV] !== DB_SCRIPT_WRITE_CONFIRMATION`);
        const policyIndex = helperScript.indexOf('assertScriptDbWriteTargetAllowed({');
        const poolIndex = helperScript.indexOf('const pool = new Pool({');

        expect(confirmationIndex).toBeGreaterThan(-1);
        expect(policyIndex).toBeGreaterThan(confirmationIndex);
        expect(poolIndex).toBeGreaterThan(policyIndex);
    });

    it('guards init-db before dropping and recreating legacy tables', () => {
        const script = fs.readFileSync(initDbPath, 'utf8');

        expect(script).toContain("const INIT_DB_ALLOW_NON_LOCAL_ENV = 'INIT_DB_ALLOW_NON_LOCAL'");
        expect(script).toContain("const INIT_DB_CONFIRM_ENV = 'INIT_DB_CONFIRM'");
        expect(script).toContain("const INIT_DB_CONFIRMATION = 'DROP_AND_RECREATE_LEGACY_TABLES'");
        expect(script).toContain("const SCRIPT_DB_NON_LOCAL_CONFIRMATION = 'APLICAR'");
        expect(script).toContain('function redactConnectionString(connectionString)');
        expect(script).toContain('function assertInitDbTargetAllowed(connectionString)');
        expect(script).toContain('redactConnectionString(databaseUrl)');

        const confirmationIndex = script.indexOf(`process.env[INIT_DB_CONFIRM_ENV] !== INIT_DB_CONFIRMATION`);
        const policyIndex = script.indexOf('assertInitDbTargetAllowed(databaseUrl)');
        const poolIndex = script.indexOf('const pool = new Pool({');
        const dropIndex = script.indexOf('DROP TABLE IF EXISTS ventas CASCADE');

        expect(confirmationIndex).toBeGreaterThan(-1);
        expect(policyIndex).toBeGreaterThan(confirmationIndex);
        expect(poolIndex).toBeGreaterThan(policyIndex);
        expect(dropIndex).toBeGreaterThan(poolIndex);
    });

    it('guards run-migration 023 before applying batch created_at SQL', () => {
        const script = fs.readFileSync(runMigration023Path, 'utf8');

        expect(script).toContain("import { redactConnectionString } from '../src/scripts/e2e-release-critical-db-policy'");
        expect(script).toContain("import { assertScriptDbWriteTargetAllowed } from '../src/scripts/script-db-target-policy'");
        expect(script).toContain("const RUN_MIGRATION_023_ALLOW_NON_LOCAL_ENV = 'RUN_MIGRATION_023_ALLOW_NON_LOCAL'");
        expect(script).toContain("const RUN_MIGRATION_023_CONFIRM_ENV = 'RUN_MIGRATION_023_CONFIRM'");
        expect(script).toContain("const RUN_MIGRATION_023_CONFIRMATION = 'APPLY_BATCH_CREATED_AT_MIGRATION'");
        expect(script).toContain('redactConnectionString(connectionString)');

        const confirmationIndex = script.indexOf(`process.env[RUN_MIGRATION_023_CONFIRM_ENV] !== RUN_MIGRATION_023_CONFIRMATION`);
        const policyIndex = script.indexOf('assertScriptDbWriteTargetAllowed({');
        const clientIndex = script.indexOf('const client = new Client({');
        const queryIndex = script.indexOf('await client.query(sql)');

        expect(confirmationIndex).toBeGreaterThan(-1);
        expect(policyIndex).toBeGreaterThan(confirmationIndex);
        expect(clientIndex).toBeGreaterThan(policyIndex);
        expect(queryIndex).toBeGreaterThan(clientIndex);
    });

    it('guards run_migration before applying enriched product fields SQL', () => {
        const script = fs.readFileSync(runEnrichedProductMigrationPath, 'utf8');

        expect(script).toContain("import { redactConnectionString } from '../src/scripts/e2e-release-critical-db-policy'");
        expect(script).toContain("import { assertScriptDbWriteTargetAllowed } from '../src/scripts/script-db-target-policy'");
        expect(script).toContain("const RUN_ENRICHED_PRODUCT_MIGRATION_ALLOW_NON_LOCAL_ENV = 'RUN_ENRICHED_PRODUCT_MIGRATION_ALLOW_NON_LOCAL'");
        expect(script).toContain("const RUN_ENRICHED_PRODUCT_MIGRATION_CONFIRM_ENV = 'RUN_ENRICHED_PRODUCT_MIGRATION_CONFIRM'");
        expect(script).toContain("const RUN_ENRICHED_PRODUCT_MIGRATION_CONFIRMATION = 'APPLY_ENRICHED_PRODUCT_FIELDS'");
        expect(script).toContain('redactConnectionString(DB_URL)');

        const confirmationIndex = script.indexOf(`process.env[RUN_ENRICHED_PRODUCT_MIGRATION_CONFIRM_ENV] !== RUN_ENRICHED_PRODUCT_MIGRATION_CONFIRMATION`);
        const policyIndex = script.indexOf('assertScriptDbWriteTargetAllowed({');
        const poolIndex = script.indexOf('const pool = new Pool({');
        const queryIndex = script.indexOf('await client.query(sql)');

        expect(confirmationIndex).toBeGreaterThan(-1);
        expect(policyIndex).toBeGreaterThan(confirmationIndex);
        expect(poolIndex).toBeGreaterThan(policyIndex);
        expect(queryIndex).toBeGreaterThan(poolIndex);
    });

    it('guards run_migrations before executing legacy init SQL blocks', () => {
        const script = fs.readFileSync(runLegacyInitSqlPath, 'utf8');

        expect(script).toContain("import { redactConnectionString } from '../src/scripts/e2e-release-critical-db-policy'");
        expect(script).toContain("import { assertScriptDbWriteTargetAllowed } from '../src/scripts/script-db-target-policy'");
        expect(script).toContain("const RUN_LEGACY_INIT_SQL_ALLOW_NON_LOCAL_ENV = 'RUN_LEGACY_INIT_SQL_ALLOW_NON_LOCAL'");
        expect(script).toContain("const RUN_LEGACY_INIT_SQL_CONFIRM_ENV = 'RUN_LEGACY_INIT_SQL_CONFIRM'");
        expect(script).toContain("const RUN_LEGACY_INIT_SQL_CONFIRMATION = 'RUN_LEGACY_INIT_SQL'");
        expect(script).toContain('redactConnectionString(databaseUrl)');

        const confirmationIndex = script.indexOf(`process.env[RUN_LEGACY_INIT_SQL_CONFIRM_ENV] !== RUN_LEGACY_INIT_SQL_CONFIRMATION`);
        const policyIndex = script.indexOf('assertScriptDbWriteTargetAllowed({');
        const poolIndex = script.indexOf('const pool = new Pool({');
        const queryIndex = script.indexOf('await client.query(block1)');

        expect(confirmationIndex).toBeGreaterThan(-1);
        expect(policyIndex).toBeGreaterThan(confirmationIndex);
        expect(poolIndex).toBeGreaterThan(policyIndex);
        expect(queryIndex).toBeGreaterThan(poolIndex);
    });

    it('guards run_master_import before executing full master data import', () => {
        const script = fs.readFileSync(runMasterImportPath, 'utf8');

        expect(script).toContain("import { redactConnectionString } from '../src/scripts/e2e-release-critical-db-policy'");
        expect(script).toContain("import { assertScriptDbWriteTargetAllowed } from '../src/scripts/script-db-target-policy'");
        expect(script).toContain("const RUN_MASTER_IMPORT_ALLOW_NON_LOCAL_ENV = 'RUN_MASTER_IMPORT_ALLOW_NON_LOCAL'");
        expect(script).toContain("const RUN_MASTER_IMPORT_CONFIRM_ENV = 'RUN_MASTER_IMPORT_CONFIRM'");
        expect(script).toContain("const RUN_MASTER_IMPORT_CONFIRMATION = 'RUN_MASTER_DATA_IMPORT'");
        expect(script).toContain('redactConnectionString(connectionString)');

        const confirmationIndex = script.indexOf(`process.env[RUN_MASTER_IMPORT_CONFIRM_ENV] !== RUN_MASTER_IMPORT_CONFIRMATION`);
        const policyIndex = script.indexOf('assertScriptDbWriteTargetAllowed({');
        const poolIndex = script.indexOf('const pool = new Pool({');
        const importIndex = script.indexOf('await service.runFullImport()');

        expect(confirmationIndex).toBeGreaterThan(-1);
        expect(policyIndex).toBeGreaterThan(confirmationIndex);
        expect(poolIndex).toBeGreaterThan(policyIndex);
        expect(importIndex).toBeGreaterThan(poolIndex);
    });

    it('provides a reusable CommonJS guard for legacy migration runners', () => {
        const script = fs.readFileSync(legacyDbScriptGuardPath, 'utf8');

        expect(script).toContain("const SCRIPT_DB_NON_LOCAL_CONFIRMATION = 'APLICAR'");
        expect(script).toContain('function redactConnectionString(connectionString)');
        expect(script).toContain('function assertLegacyDbWriteTargetAllowed');
        expect(script).toContain('function assertLegacyDbWriteConfirmed');
        expect(script).toContain("parsed.hostname.includes('pooler.supabase.com')");
        expect(script).toContain("parsed.searchParams.get('pgbouncer') === 'true'");
        expect(script).toContain("parsed.searchParams.get('connection_limit') === '1'");
        expect(script).toContain('module.exports = {');
    });

    it('guards apply-products-migration before running supplier parsing SQL', () => {
        const script = fs.readFileSync(applyProductsMigrationPath, 'utf8');

        expect(script).toContain("} = require('./legacy-db-script-guard.cjs')");
        expect(script).toContain("const APPLY_PRODUCTS_MIGRATION_ALLOW_NON_LOCAL_ENV = 'APPLY_PRODUCTS_MIGRATION_ALLOW_NON_LOCAL'");
        expect(script).toContain("const APPLY_PRODUCTS_MIGRATION_CONFIRM_ENV = 'APPLY_PRODUCTS_MIGRATION_CONFIRM'");
        expect(script).toContain("const APPLY_PRODUCTS_MIGRATION_CONFIRMATION = 'APPLY_SUPPLIER_PARSING_COLUMNS'");
        expect(script).toContain('redactConnectionString(connectionString)');

        const confirmationIndex = script.indexOf('assertLegacyDbWriteConfirmed({');
        const policyIndex = script.indexOf('assertLegacyDbWriteTargetAllowed({');
        const poolIndex = script.indexOf('const pool = new Pool({');
        const queryIndex = script.indexOf('await pool.query(sql)');

        expect(confirmationIndex).toBeGreaterThan(-1);
        expect(policyIndex).toBeGreaterThan(confirmationIndex);
        expect(poolIndex).toBeGreaterThan(policyIndex);
        expect(queryIndex).toBeGreaterThan(poolIndex);
    });

    it('guards apply-recibo-migration before migrating boletas to recibos', () => {
        const script = fs.readFileSync(applyReciboMigrationPath, 'utf8');

        expect(script).toContain("} = require('./legacy-db-script-guard.cjs')");
        expect(script).toContain("const APPLY_RECIBO_MIGRATION_ALLOW_NON_LOCAL_ENV = 'APPLY_RECIBO_MIGRATION_ALLOW_NON_LOCAL'");
        expect(script).toContain("const APPLY_RECIBO_MIGRATION_CONFIRM_ENV = 'APPLY_RECIBO_MIGRATION_CONFIRM'");
        expect(script).toContain("const APPLY_RECIBO_MIGRATION_CONFIRMATION = 'MIGRATE_BOLETAS_TO_RECIBOS'");
        expect(script).toContain('redactConnectionString(connectionString)');

        const confirmationIndex = script.indexOf('assertLegacyDbWriteConfirmed({');
        const policyIndex = script.indexOf('assertLegacyDbWriteTargetAllowed({');
        const poolIndex = script.indexOf('const pool = new Pool({');
        const queryIndex = script.indexOf('await pool.query(sql)');

        expect(confirmationIndex).toBeGreaterThan(-1);
        expect(policyIndex).toBeGreaterThan(confirmationIndex);
        expect(poolIndex).toBeGreaterThan(policyIndex);
        expect(queryIndex).toBeGreaterThan(poolIndex);
    });

    it('guards run-fuzzy-migration before enabling fuzzy search SQL', () => {
        const script = fs.readFileSync(runFuzzyMigrationPath, 'utf8');

        expect(script).toContain("} = require('./legacy-db-script-guard.cjs')");
        expect(script).toContain("const RUN_FUZZY_MIGRATION_ALLOW_NON_LOCAL_ENV = 'RUN_FUZZY_MIGRATION_ALLOW_NON_LOCAL'");
        expect(script).toContain("const RUN_FUZZY_MIGRATION_CONFIRM_ENV = 'RUN_FUZZY_MIGRATION_CONFIRM'");
        expect(script).toContain("const RUN_FUZZY_MIGRATION_CONFIRMATION = 'ENABLE_FUZZY_SEARCH'");
        expect(script).toContain('redactConnectionString(connectionString)');

        const confirmationIndex = script.indexOf('assertLegacyDbWriteConfirmed({');
        const policyIndex = script.indexOf('assertLegacyDbWriteTargetAllowed({');
        const poolIndex = script.indexOf('const pool = new Pool({');
        const queryIndex = script.indexOf('await client.query(sql)');

        expect(confirmationIndex).toBeGreaterThan(-1);
        expect(policyIndex).toBeGreaterThan(confirmationIndex);
        expect(poolIndex).toBeGreaterThan(policyIndex);
        expect(queryIndex).toBeGreaterThan(poolIndex);
    });

    it('guards dev-account:ensure before creating or updating the controlled DEV account', () => {
        const script = fs.readFileSync(ensureDevAccountPath, 'utf8');

        expect(script).toContain("import { assertScriptDbWriteTargetAllowed } from './script-db-target-policy'");
        expect(script).toContain("const DEV_ACCOUNT_ALLOW_NON_LOCAL_ENV = 'DEV_ACCOUNT_ALLOW_NON_LOCAL'");
        expect(script).toContain('process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL');
        expect(script).toContain("scriptName: 'dev-account:ensure'");
        expect(script).toContain('allowNonLocalEnv: DEV_ACCOUNT_ALLOW_NON_LOCAL_ENV');
        expect(script).not.toContain("console.log('ℹ️ PIN configurado: 1213')");

        const policyIndex = script.indexOf('assertScriptDbWriteTargetAllowed({');
        const poolIndex = script.indexOf('return new Pool({');
        const updateIndex = script.indexOf('UPDATE users');
        const insertIndex = script.indexOf('INSERT INTO users');

        expect(policyIndex).toBeGreaterThan(-1);
        expect(poolIndex).toBeGreaterThan(policyIndex);
        expect(updateIndex).toBeGreaterThan(poolIndex);
        expect(insertIndex).toBeGreaterThan(poolIndex);
    });

    it('guards dev-account:disable before deactivating or rotating the controlled DEV account', () => {
        const script = fs.readFileSync(disableDevAccountPath, 'utf8');

        expect(script).toContain("import { assertScriptDbWriteTargetAllowed } from './script-db-target-policy'");
        expect(script).toContain("const DEV_ACCOUNT_ALLOW_NON_LOCAL_ENV = 'DEV_ACCOUNT_ALLOW_NON_LOCAL'");
        expect(script).toContain('process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL');
        expect(script).toContain("scriptName: 'dev-account:disable'");
        expect(script).toContain('allowNonLocalEnv: DEV_ACCOUNT_ALLOW_NON_LOCAL_ENV');

        const validationIndex = script.indexOf('validateRotatePin(rotatePin)');
        const policyIndex = script.indexOf('assertScriptDbWriteTargetAllowed({');
        const createPoolCallIndex = script.indexOf('const pool = createScriptPool();');
        const poolIndex = script.indexOf('return new Pool({');
        const updateIndex = script.indexOf('UPDATE users');

        expect(validationIndex).toBeGreaterThan(-1);
        expect(createPoolCallIndex).toBeGreaterThan(validationIndex);
        expect(poolIndex).toBeGreaterThan(policyIndex);
        expect(createPoolCallIndex).toBeGreaterThan(poolIndex);
        expect(updateIndex).toBeGreaterThan(poolIndex);
    });

    it('guards migrate:pins before opening an actual PIN migration connection', () => {
        const script = fs.readFileSync(migratePinsPath, 'utf8');

        expect(script).toContain("import { assertScriptDbWriteTargetAllowed } from './script-db-target-policy'");
        expect(script).toContain("const MIGRATE_PINS_ALLOW_NON_LOCAL_ENV = 'MIGRATE_PINS_ALLOW_NON_LOCAL'");
        expect(script).toContain('process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL');
        expect(script).toContain("scriptName: 'migrate:pins'");
        expect(script).toContain('allowNonLocalEnv: MIGRATE_PINS_ALLOW_NON_LOCAL_ENV');
        expect(script).toContain('if (!DRY_RUN) {');

        const policyIndex = script.indexOf('assertScriptDbWriteTargetAllowed({');
        const poolIndex = script.indexOf('const pool = new Pool({');
        const alterIndex = script.indexOf('await client.query(`\n                    ALTER TABLE users ADD COLUMN IF NOT EXISTS access_pin_hash');
        const updateIndex = script.indexOf('await client.query(`\n                    UPDATE users');

        expect(policyIndex).toBeGreaterThan(-1);
        expect(poolIndex).toBeGreaterThan(policyIndex);
        expect(alterIndex).toBeGreaterThan(poolIndex);
        expect(updateIndex).toBeGreaterThan(poolIndex);
    });
});
