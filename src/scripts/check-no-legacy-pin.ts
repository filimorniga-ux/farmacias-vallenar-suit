#!/usr/bin/env tsx

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const LEGACY_PIN = ['12', '13'].join('');

const SEARCH_ROOTS = ['src', 'tests', '.github'] as const;
const ROOT_FILES = ['package.json'] as const;

const EXCLUDED_DIRS = new Set([
    'node_modules',
    '.next',
    'build',
    'out',
    'coverage',
    'test-results',
    'playwright-report',
]);

const ALLOWLIST = new Set([
    'src/scripts/dev-account-support.ts',
    'src/scripts/ensure-dev-gerente-general.ts',
    'tests/actions/auth-v2.test.ts',
    'tests/lib/pin-rbac.test.ts',
]);

function walkDir(relativeDir: string, files: string[]) {
    const absoluteDir = path.join(ROOT, relativeDir);
    if (!existsSync(absoluteDir)) return;

    for (const entry of readdirSync(absoluteDir)) {
        if (EXCLUDED_DIRS.has(entry)) continue;

        const relativePath = path.join(relativeDir, entry);
        const absolutePath = path.join(ROOT, relativePath);
        const stats = statSync(absolutePath);

        if (stats.isDirectory()) {
            walkDir(relativePath, files);
            continue;
        }

        files.push(relativePath);
    }
}

function collectCandidateFiles() {
    const files: string[] = [];

    for (const rootFile of ROOT_FILES) {
        if (existsSync(path.join(ROOT, rootFile))) {
            files.push(rootFile);
        }
    }

    for (const rootDir of SEARCH_ROOTS) {
        walkDir(rootDir, files);
    }

    return files.sort();
}

function findLegacyPinLines(relativePath: string) {
    const absolutePath = path.join(ROOT, relativePath);
    const content = readFileSync(absolutePath, 'utf-8');

    if (!content.includes(LEGACY_PIN)) {
        return [];
    }

    return content
        .split(/\r?\n/)
        .map((line, index) => ({ lineNumber: index + 1, line }))
        .filter(({ line }) => line.includes(LEGACY_PIN));
}

function main() {
    const offenders: Array<{ file: string; matches: Array<{ lineNumber: number; line: string }> }> = [];

    for (const relativePath of collectCandidateFiles()) {
        const matches = findLegacyPinLines(relativePath);
        if (matches.length === 0) continue;
        if (ALLOWLIST.has(relativePath)) continue;

        offenders.push({ file: relativePath, matches });
    }

    if (offenders.length === 0) {
        console.log('✅ Guardrail PIN legacy OK: no se detectaron referencias fuera de la allowlist.');
        return;
    }

    console.error('❌ Guardrail PIN legacy FAILED: se detectaron referencias fuera de la allowlist aprobada.\n');
    console.error('Allowlist activa:');
    for (const allowedFile of [...ALLOWLIST].sort()) {
        console.error(`  - ${allowedFile}`);
    }

    console.error('\nArchivos infractores:');
    for (const offender of offenders) {
        console.error(`\n- ${offender.file}`);
        for (const match of offender.matches) {
            console.error(`  L${match.lineNumber}: ${match.line.trim()}`);
        }
    }

    process.exit(1);
}

main();
