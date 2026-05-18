import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const migrationPath = path.join(
    process.cwd(),
    'src',
    'db',
    'migrations',
    '043_monthly_closing_baseline.sql'
);

describe('Migration 043 - Monthly closing baseline', () => {
    it('exists in src/db/migrations', () => {
        expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it('creates monthly closing tables idempotently with finance fields', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.monthly_closings');
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.monthly_closing_entries');
        expect(sql).toContain('total_sales_income NUMERIC(12, 2) GENERATED ALWAYS AS');
        expect(sql).toContain('net_result NUMERIC(12, 2) GENERATED ALWAYS AS');
        expect(sql).toContain('social_security_cost NUMERIC(12, 2) DEFAULT 0');
        expect(sql).toContain("status TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CLOSED'))");
        expect(sql).toContain('ADD COLUMN IF NOT EXISTS social_security_cost NUMERIC(12, 2) DEFAULT 0');
    });

    it('keeps lookup indexes and entry category constraints explicit', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS monthly_closings_month_year_key');
        expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_mce_month_year');
        expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_mce_category');
        expect(sql).toContain("'CASH'");
        expect(sql).toContain("'TRANSFER_IN'");
        expect(sql).toContain("'CARD_INSTALLMENT'");
        expect(sql).toContain("'DAILY_EXPENSE'");
        expect(sql).toContain("'TRANSFER_OUT'");
        expect(sql).toContain("'PAYROLL'");
        expect(sql).toContain("'FIXED_EXPENSE'");
        expect(sql).toContain("'TAX'");
        expect(sql).toContain("'OWNER_WITHDRAWAL'");
    });

    it('enables RLS and creates explicit API deny policies', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain("FOREACH target_table_name IN ARRAY ARRAY['monthly_closings', 'monthly_closing_entries']");
        expect(sql).toContain('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY');
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
        expect(sql).toContain("'043'");
        expect(sql).toContain('043_monthly_closing_baseline.sql');
    });
});
