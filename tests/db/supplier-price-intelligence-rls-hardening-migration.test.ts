import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const migrationPath = path.join(
    process.cwd(),
    'src',
    'db',
    'migrations',
    '041_supplier_price_intelligence_rls_hardening.sql'
);

describe('Migration 041 - Supplier price intelligence RLS hardening', () => {
    it('exists in src/db/migrations', () => {
        expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it('removes permissive authenticated policies and keeps RLS enabled', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY');
        expect(sql).toContain('DROP POLICY IF EXISTS auth_spp ON public.supplier_product_prices');
        expect(sql).toContain('DROP POLICY IF EXISTS auth_pr ON public.price_recommendations');
        expect(sql).toContain("FOREACH target_table_name IN ARRAY ARRAY['supplier_product_prices', 'price_recommendations']");
        expect(sql).toContain('to_regclass');
    });

    it('creates explicit API deny policies for Supabase client roles', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain("rolname = 'anon'");
        expect(sql).toContain("rolname = 'authenticated'");
        expect(sql).toContain("api_roles := 'PUBLIC'");
        expect(sql).toContain("target_deny_policy_name := format('%s_deny_api', target_table_name)");
        expect(sql).toContain('USING (false)');
        expect(sql).toContain('WITH CHECK (false)');
        expect(sql).toContain('CREATE POLICY %I ON public.%I FOR ALL TO %s');
    });

    it('registers itself in schema_migrations', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain('CREATE TABLE IF NOT EXISTS schema_migrations');
        expect(sql).toContain('INSERT INTO schema_migrations');
        expect(sql).toContain("'041'");
        expect(sql).toContain('041_supplier_price_intelligence_rls_hardening.sql');
    });
});
