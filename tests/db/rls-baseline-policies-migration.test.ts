import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const migrationPath = path.join(
    process.cwd(),
    'src',
    'db',
    'migrations',
    '019_supabase_rls_baseline_policies.sql'
);

describe('Migration 019 - Supabase RLS baseline policies', () => {
    it('should exist in src/db/migrations', () => {
        expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it('should create policies only for tables with RLS enabled and no policies', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain('c.relrowsecurity = TRUE');
        expect(sql).toContain('FROM pg_policies p');
        expect(sql).toContain('AND NOT EXISTS (');
        expect(sql).toContain('CREATE POLICY');
        expect(sql).toContain('USING (false)');
        expect(sql).toContain('WITH CHECK (false)');
    });

    it('should be safe when anon/authenticated roles do not exist', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain("rolname = 'anon'");
        expect(sql).toContain("rolname = 'authenticated'");
        expect(sql).toContain("role_clause := 'PUBLIC'");
    });
});
