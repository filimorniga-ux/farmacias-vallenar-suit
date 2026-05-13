import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const cliPath = path.join(process.cwd(), 'src', 'cli', 'terminals.ts');

describe('terminals CLI write target policy', () => {
    it('guards write commands before opening a DB connection', () => {
        const script = fs.readFileSync(cliPath, 'utf8');

        expect(script).toContain("import { assertScriptDbWriteTargetAllowed } from '../scripts/script-db-target-policy'");
        expect(script).toContain("const TERMINALS_CLI_ALLOW_NON_LOCAL_ENV = 'TERMINALS_CLI_ALLOW_NON_LOCAL'");
        expect(script).toContain("assertTerminalWriteTargetAllowed('terminals:force-close')");
        expect(script).toContain("assertTerminalWriteTargetAllowed('terminals:cleanup')");
        expect(script).toContain('allowNonLocalEnv: TERMINALS_CLI_ALLOW_NON_LOCAL_ENV');

        const forceCloseIndex = script.indexOf("assertTerminalWriteTargetAllowed('terminals:force-close')");
        const cleanupIndex = script.indexOf("assertTerminalWriteTargetAllowed('terminals:cleanup')");
        const firstConnectIndex = script.indexOf('const client = await pool.connect();', script.indexOf("program.command('force-close')"));
        const cleanupConnectIndex = script.indexOf('const client = await pool.connect();', script.indexOf("program.command('cleanup')"));

        expect(forceCloseIndex).toBeGreaterThan(-1);
        expect(cleanupIndex).toBeGreaterThan(-1);
        expect(firstConnectIndex).toBeGreaterThan(forceCloseIndex);
        expect(cleanupConnectIndex).toBeGreaterThan(cleanupIndex);
    });

    it('keeps read-only terminal commands free of write target guards', () => {
        const script = fs.readFileSync(cliPath, 'utf8');
        const statusCommand = script.slice(script.indexOf("program.command('status')"), script.indexOf("program.command('health')"));
        const healthCommand = script.slice(script.indexOf("program.command('health')"), script.indexOf("program.command('force-close')"));

        expect(statusCommand).not.toContain('assertTerminalWriteTargetAllowed');
        expect(healthCommand).not.toContain('assertTerminalWriteTargetAllowed');
    });
});
