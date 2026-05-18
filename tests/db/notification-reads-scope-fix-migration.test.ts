import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const migrationPath = path.join(
    process.cwd(),
    'src',
    'db',
    'migrations',
    '038_notification_reads_scope_fix.sql'
);

describe('Migration 038 - Notification reads scope fix', () => {
    it('exists in src/db/migrations', () => {
        expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it('creates notification_reads with per-user visibility indexes', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain('CREATE TABLE IF NOT EXISTS notification_reads');
        expect(sql).toContain('notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE');
        expect(sql).toContain('user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE');
        expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_reads_notification_user');
        expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_notification_reads_user_visibility');
    });

    it('enables RLS and creates an explicit API deny policy', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain('ALTER TABLE IF EXISTS public.notification_reads ENABLE ROW LEVEL SECURITY');
        expect(sql).toContain('notification_reads_deny_api');
        expect(sql).toContain('USING (false)');
        expect(sql).toContain('WITH CHECK (false)');
        expect(sql).toContain("rolname = 'anon'");
        expect(sql).toContain("rolname = 'authenticated'");
    });

    it('registers itself in schema_migrations', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain('CREATE TABLE IF NOT EXISTS schema_migrations');
        expect(sql).toContain('INSERT INTO schema_migrations');
        expect(sql).toContain("'038'");
        expect(sql).toContain('038_notification_reads_scope_fix.sql');
    });
});
