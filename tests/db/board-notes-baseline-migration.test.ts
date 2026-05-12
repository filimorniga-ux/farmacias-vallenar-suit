import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const migrationPath = path.join(
    process.cwd(),
    'src',
    'db',
    'migrations',
    '040_board_notes_baseline.sql'
);

describe('Migration 040 - Formal board_notes baseline', () => {
    it('exists in src/db/migrations', () => {
        expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it('creates board_notes idempotently with server-action fields', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.board_notes');
        expect(sql).toContain('content TEXT NOT NULL');
        expect(sql).toContain('author_name TEXT NOT NULL');
        expect(sql).toContain('author_role TEXT');
        expect(sql).toContain("branch TEXT DEFAULT 'General'");
        expect(sql).toContain('created_by UUID');
        expect(sql).toContain('created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()');
        expect(sql).toContain('ADD COLUMN IF NOT EXISTS created_by UUID');
    });

    it('enables RLS and creates an explicit API deny policy', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain('ALTER TABLE IF EXISTS public.board_notes ENABLE ROW LEVEL SECURITY');
        expect(sql).toContain('board_notes_deny_api');
        expect(sql).toContain('USING (false)');
        expect(sql).toContain('WITH CHECK (false)');
        expect(sql).toContain("rolname = 'anon'");
        expect(sql).toContain("rolname = 'authenticated'");
    });

    it('registers itself in schema_migrations', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain('INSERT INTO schema_migrations');
        expect(sql).toContain("'040'");
    });
});
