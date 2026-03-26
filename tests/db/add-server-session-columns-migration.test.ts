import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const migrationPath = path.join(
    process.cwd(),
    'src',
    'db',
    'migrations',
    '037_add_server_session_columns.sql'
);

describe('Migration 037 - Add server-side session columns', () => {
    it('should exist in src/db/migrations', () => {
        expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it('should add session columns required by hardened auth', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain('ADD COLUMN IF NOT EXISTS session_token TEXT');
        expect(sql).toContain('ADD COLUMN IF NOT EXISTS token_version INT DEFAULT 1');
        expect(sql).toContain('ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP DEFAULT NOW()');
        expect(sql).toContain("ADD COLUMN IF NOT EXISTS current_context_data JSONB DEFAULT '{}'::jsonb");
        expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_users_session_token');
    });

    it('should register itself in schema_migrations', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain('INSERT INTO schema_migrations');
        expect(sql).toContain("'037'");
    });
});
