import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const fixMigrationsSchemaPath = path.join(process.cwd(), 'src', 'scripts', 'fix-migrations-schema.ts');
const seedShiftTemplatesPath = path.join(process.cwd(), 'src', 'scripts', 'seed-shift-templates.ts');

describe('db-cli write script policy', () => {
    it('guards fix-migrations-schema before altering schema_migrations', () => {
        const script = fs.readFileSync(fixMigrationsSchemaPath, 'utf8');

        expect(script).toContain("import { assertScriptDbWriteTargetAllowed } from './script-db-target-policy'");
        expect(script).toContain("const FIX_MIGRATIONS_SCHEMA_ALLOW_NON_LOCAL_ENV = 'FIX_MIGRATIONS_SCHEMA_ALLOW_NON_LOCAL'");
        expect(script).toContain("scriptName: 'fix-migrations-schema'");
        expect(script).toContain('allowNonLocalEnv: FIX_MIGRATIONS_SCHEMA_ALLOW_NON_LOCAL_ENV');

        const policyIndex = script.indexOf('assertScriptDbWriteTargetAllowed({');
        const connectIndex = script.indexOf('const client = await pool.connect();');
        const alterIndex = script.indexOf('ALTER TABLE schema_migrations ALTER COLUMN version TYPE VARCHAR(100)');

        expect(policyIndex).toBeGreaterThan(-1);
        expect(connectIndex).toBeGreaterThan(policyIndex);
        expect(alterIndex).toBeGreaterThan(connectIndex);
    });

    it('guards seed-shift-templates before inserting templates', () => {
        const script = fs.readFileSync(seedShiftTemplatesPath, 'utf8');

        expect(script).toContain("import { assertScriptDbWriteTargetAllowed } from './script-db-target-policy'");
        expect(script).toContain("const SEED_SHIFT_TEMPLATES_ALLOW_NON_LOCAL_ENV = 'SEED_SHIFT_TEMPLATES_ALLOW_NON_LOCAL'");
        expect(script).toContain("scriptName: 'seed-shift-templates'");
        expect(script).toContain('allowNonLocalEnv: SEED_SHIFT_TEMPLATES_ALLOW_NON_LOCAL_ENV');

        const policyIndex = script.indexOf('assertScriptDbWriteTargetAllowed({');
        const queryIndex = script.indexOf('await pool.query(`');
        const insertIndex = script.indexOf('INSERT INTO shift_templates');

        expect(policyIndex).toBeGreaterThan(-1);
        expect(queryIndex).toBeGreaterThan(policyIndex);
        expect(insertIndex).toBeGreaterThan(queryIndex);
    });
});
