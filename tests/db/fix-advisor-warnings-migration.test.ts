import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
    process.cwd(),
    'src',
    'db',
    'migrations',
    '036_fix_advisor_warnings.sql',
);

describe('Migration 036 - Fix Supabase advisor warnings', () => {
    it('replaces the permissive price cost history policy with scoped policies', () => {
        const sql = readFileSync(migrationPath, 'utf8');

        expect(sql).toContain('ALTER TABLE public.price_cost_history ENABLE ROW LEVEL SECURITY');
        expect(sql).toContain('DROP POLICY IF EXISTS "Allow all for authenticated" ON public.price_cost_history');
        expect(sql).toContain('CREATE POLICY pch_select_authenticated');
        expect(sql).toContain('CREATE POLICY pch_insert_authenticated');
        expect(sql).toContain('CREATE POLICY pch_update_own');
        expect(sql).toContain('CREATE POLICY pch_deny_delete');
        expect(sql).toContain('public.users WHERE id::text = user_id::text');
        expect(sql).toContain('FOR DELETE TO %s USING (false)');
        expect(sql).not.toContain('FOR ALL TO authenticated USING (true) WITH CHECK (true)');
    });

    it('is safe in non-Supabase/local environments without API roles or optional tables', () => {
        const sql = readFileSync(migrationPath, 'utf8');

        expect(sql).toContain("rolname = 'anon'");
        expect(sql).toContain("rolname = 'authenticated'");
        expect(sql).toContain("api_roles := 'PUBLIC'");
        expect(sql).toContain("IF to_regclass('public.price_cost_history') IS NOT NULL THEN");
        expect(sql).toContain("IF to_regclass('public.pin_resets') IS NOT NULL THEN");
        expect(sql).toContain("IF to_regclass('public.refunds') IS NOT NULL THEN");
        expect(sql).toContain("IF to_regclass('public.sales') IS NOT NULL THEN");
    });

    it('records the migration for the predeploy gate', () => {
        const sql = readFileSync(migrationPath, 'utf8');

        expect(sql).toContain('CREATE TABLE IF NOT EXISTS schema_migrations');
        expect(sql).toContain("VALUES (\n    '036',");
        expect(sql).toContain('Fix Supabase advisor warnings');
        expect(sql).toContain("MD5('036_fix_advisor_warnings.sql')");
    });
});
