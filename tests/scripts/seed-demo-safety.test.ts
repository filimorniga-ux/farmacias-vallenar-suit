import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const scriptPath = path.join(process.cwd(), 'src', 'scripts', 'seed-demo-vallenar.ts');

describe('seed demo script safety policy', () => {
    it('fails closed for non-local targets unless explicitly confirmed', () => {
        const script = fs.readFileSync(scriptPath, 'utf8');

        expect(script).toContain("const SEED_DEMO_NON_LOCAL_CONFIRMATION = 'APLICAR'");
        expect(script).toContain('function assertSeedTargetIsAllowed');
        expect(script).toContain('SEED_DEMO_ALLOW_NON_LOCAL');
        expect(script).toContain('seed:demo es destructivo');
        expect(script.indexOf('assertSeedTargetIsAllowed(connectionString)'))
            .toBeLessThan(script.indexOf('new Pool'));
    });

    it('redacts the selected connection string before logging', () => {
        const script = fs.readFileSync(scriptPath, 'utf8');

        expect(script).toContain("import { redactConnectionString } from './e2e-release-critical-db-policy'");
        expect(script).toContain("console.log('🔌 Connecting to DB:', redactConnectionString(connectionString))");
        expect(script).not.toContain("connectionString.replace(/:[^:@]+@/, ':****@')");
    });
});
