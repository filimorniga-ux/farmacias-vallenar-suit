import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const writePatterns = [
    /\bTRUNCATE\b/i,
    /\bDELETE\s+FROM\b/i,
    /\bUPDATE\s+[a-z_]/i,
    /\bINSERT\s+INTO\b/i,
    /\bALTER\s+TABLE\b/i,
    /\bDROP\s+TABLE\b/i,
] as const;

const guardPatterns = [
    /assertScriptDbWriteTargetAllowed/,
    /assertLegacyDbWriteTargetAllowed/,
    /assertSeedTargetIsAllowed/,
    /assertInitDbTargetAllowed/,
    /SEGURIDAD: Este script SOLO puede correr en Docker/,
] as const;

function extractScriptPath(command: string) {
    const match = command.match(/\b(?:tsx|node)\s+((?:src\/scripts|src\/cli|scripts)\/[^\s]+)/);
    return match?.[1] ?? null;
}

describe('package DB script safety', () => {
    it('keeps package-exposed DB write scripts behind target guards', () => {
        const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
            scripts: Record<string, string>;
        };

        const unsafeCommands = Object.entries(packageJson.scripts)
            .map(([name, command]) => ({ name, command, scriptPath: extractScriptPath(command) }))
            .filter((entry): entry is { name: string; command: string; scriptPath: string } => Boolean(entry.scriptPath))
            .filter((entry) => fs.existsSync(path.join(process.cwd(), entry.scriptPath)))
            .filter((entry) => {
                const script = fs.readFileSync(path.join(process.cwd(), entry.scriptPath), 'utf8');
                const writes = writePatterns.some((pattern) => pattern.test(script));
                const guarded = guardPatterns.some((pattern) => pattern.test(script));
                return writes && !guarded;
            })
            .map((entry) => `${entry.name} -> ${entry.scriptPath}`);

        expect(unsafeCommands).toEqual([]);
    });
});
