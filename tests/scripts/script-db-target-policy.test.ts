import { describe, expect, it } from 'vitest';
import {
    SCRIPT_DB_NON_LOCAL_CONFIRMATION,
    getScriptDbWriteTargetIssue,
} from '../../src/scripts/script-db-target-policy';

describe('script db target write policy', () => {
    it('allows local database targets by default', () => {
        const issue = getScriptDbWriteTargetIssue({
            scriptName: 'run-migrations',
            connectionString: 'postgres://postgres:postgres@localhost:55433/farmacia_guardrails_ci',
            allowNonLocalEnv: 'RUN_MIGRATIONS_ALLOW_NON_LOCAL',
            env: {},
        });

        expect(issue).toBeNull();
    });

    it('blocks non-local write targets unless explicitly confirmed', () => {
        const issue = getScriptDbWriteTargetIssue({
            scriptName: 'run-migrations',
            connectionString: 'postgres://app:secret@db.example.com:5432/farmacia',
            allowNonLocalEnv: 'RUN_MIGRATIONS_ALLOW_NON_LOCAL',
            env: {},
        });

        expect(issue).toContain('run-migrations escribe en DB');
        expect(issue).toContain(`RUN_MIGRATIONS_ALLOW_NON_LOCAL=${SCRIPT_DB_NON_LOCAL_CONFIRMATION}`);
        expect(issue).toContain('postgres://app:****@db.example.com:5432/farmacia');
        expect(issue).not.toContain('secret');
    });

    it('allows non-local direct targets only with explicit confirmation', () => {
        const issue = getScriptDbWriteTargetIssue({
            scriptName: 'prepare-predeploy-ci-db',
            connectionString: 'postgres://app:secret@db.example.com:5432/farmacia',
            allowNonLocalEnv: 'PREDEPLOY_CI_DB_ALLOW_NON_LOCAL',
            env: {
                PREDEPLOY_CI_DB_ALLOW_NON_LOCAL: SCRIPT_DB_NON_LOCAL_CONFIRMATION,
            },
        });

        expect(issue).toBeNull();
    });

    it('blocks pooler-style targets even if non-local writes are confirmed', () => {
        const issue = getScriptDbWriteTargetIssue({
            scriptName: 'run-migrations',
            connectionString: 'postgresql://app:secret@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1',
            allowNonLocalEnv: 'RUN_MIGRATIONS_ALLOW_NON_LOCAL',
            env: {
                RUN_MIGRATIONS_ALLOW_NON_LOCAL: SCRIPT_DB_NON_LOCAL_CONFIRMATION,
            },
        });

        expect(issue).toContain('no puede ejecutar escrituras contra una URL tipo pooler');
        expect(issue).toContain('host pooler.supabase.com');
        expect(issue).toContain('pgbouncer=true');
        expect(issue).toContain('connection_limit=1');
        expect(issue).not.toContain('secret');
    });
});
