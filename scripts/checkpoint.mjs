#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        stdio: 'inherit',
        shell: false,
        ...options
    });

    if (result.status !== 0) {
        throw new Error(`Command failed: ${command} ${args.join(' ')}`);
    }
}

function runStatus(command, args, options = {}) {
    return spawnSync(command, args, {
        stdio: 'ignore',
        shell: false,
        ...options
    }).status;
}

try {
    run('git', ['rev-parse', '--is-inside-work-tree']);
    run('git', ['add', '-A']);

    const diffStatus = runStatus('git', ['diff', '--cached', '--quiet']);
    if (diffStatus === 0) {
        console.log('No hay cambios para commit. Checkpoint omitido.');
        process.exit(0);
    }

    if (diffStatus !== 1) {
        throw new Error('No se pudo verificar el estado del índice git');
    }

    const customMessage = process.argv.slice(2).join(' ').trim();
    const fallbackMessage = `Auto Checkpoint ${new Date().toISOString()}`;
    const message = customMessage || fallbackMessage;

    run('git', ['commit', '-m', message]);
    run('git', ['push']);

    console.log('Checkpoint completado con éxito.');
} catch (error) {
    const err = error instanceof Error ? error.message : String(error);
    console.error(`Checkpoint falló: ${err}`);
    process.exit(1);
}
