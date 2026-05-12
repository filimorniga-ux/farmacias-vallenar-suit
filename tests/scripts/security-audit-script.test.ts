import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const scriptPath = path.join(process.cwd(), 'src', 'scripts', 'audit-system-health.ts');
const seedSandboxPath = path.join(process.cwd(), 'src', 'scripts', 'seed-sandbox.ts');

describe('security audit script policy', () => {
    it('keeps npm run security:audit read-only unless repair is explicitly confirmed', () => {
        const script = fs.readFileSync(scriptPath, 'utf8');

        expect(script).toContain("const REPAIR_CONFIRMATION = 'APLICAR'");
        expect(script).toContain('SECURITY_AUDIT_REPAIR_CONFIRM');
        expect(script).toContain('Read-only mode');
        expect(script).toContain('if (repairMode)');
        expect(script.indexOf('SELECT COUNT(*)::int AS count\n            FROM sales'))
            .toBeLessThan(script.indexOf('UPDATE sales'));
        expect(script).toContain('if (repairMode) {\n                    await client.query(`CREATE INDEX ${indexName}');
        expect(script).toContain('Missing Index:');
    });

    it('guards security:audit repair mode before opening a write-capable DB pool', () => {
        const script = fs.readFileSync(scriptPath, 'utf8');

        expect(script).toContain("const { redactConnectionString } = require('./e2e-release-critical-db-policy')");
        expect(script).toContain("const { assertScriptDbWriteTargetAllowed } = require('./script-db-target-policy')");
        expect(script).toContain('process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL');
        expect(script).toContain("const SECURITY_AUDIT_REPAIR_ALLOW_NON_LOCAL_ENV = 'SECURITY_AUDIT_REPAIR_ALLOW_NON_LOCAL'");
        expect(script).toContain("scriptName: 'security:audit:repair'");
        expect(script).toContain('allowNonLocalEnv: SECURITY_AUDIT_REPAIR_ALLOW_NON_LOCAL_ENV');
        expect(script).toContain('redactConnectionString(connectionString ?? \'\')');

        const repairModeIndex = script.indexOf('if (repairMode) {');
        const policyIndex = script.indexOf('assertScriptDbWriteTargetAllowed({');
        const poolIndex = script.indexOf('return new Pool({');
        const updateIndex = script.indexOf('UPDATE sales');

        expect(repairModeIndex).toBeGreaterThan(-1);
        expect(policyIndex).toBeGreaterThan(repairModeIndex);
        expect(poolIndex).toBeGreaterThan(policyIndex);
        expect(updateIndex).toBeGreaterThan(poolIndex);
    });

    it('redacts DATABASE_URL when seed:sandbox blocks non-local targets', () => {
        const script = fs.readFileSync(seedSandboxPath, 'utf8');

        expect(script).toContain("import { redactConnectionString } from './e2e-release-critical-db-policy'");
        expect(script).toContain("redactConnectionString(dbUrl)");
        expect(script).not.toContain("console.error('DATABASE_URL actual:', dbUrl)");
    });
});
