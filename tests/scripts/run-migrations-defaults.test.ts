import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const scriptPath = path.join(process.cwd(), 'src', 'scripts', 'run-migrations.ts');

describe('run-migrations default hotfix set', () => {
    it('includes security baseline migrations in dependency order', () => {
        const script = fs.readFileSync(scriptPath, 'utf8');

        expect(script).toContain("'019_supabase_rls_baseline_policies.sql'");
        expect(script).toContain("'040_board_notes_baseline.sql'");
        expect(script).toContain("'041_supplier_price_intelligence_rls_hardening.sql'");
        expect(script).toContain("'042_inventory_wms_rls_hardening.sql'");
        expect(script).toContain("'043_monthly_closing_baseline.sql'");
        expect(script.indexOf("'019_supabase_rls_baseline_policies.sql'"))
            .toBeLessThan(script.indexOf("'020_fix_batch_product_canonicalization.sql'"));
        expect(script.indexOf("'039_invoice_deleted_audit_action.sql'"))
            .toBeLessThan(script.indexOf("'040_board_notes_baseline.sql'"));
        expect(script.indexOf("'040_board_notes_baseline.sql'"))
            .toBeLessThan(script.indexOf("'041_supplier_price_intelligence_rls_hardening.sql'"));
        expect(script.indexOf("'041_supplier_price_intelligence_rls_hardening.sql'"))
            .toBeLessThan(script.indexOf("'042_inventory_wms_rls_hardening.sql'"));
        expect(script.indexOf("'042_inventory_wms_rls_hardening.sql'"))
            .toBeLessThan(script.indexOf("'043_monthly_closing_baseline.sql'"));
    });

    it('keeps local rehearsal migrations on non-SSL connections with useful failure logging', () => {
        const script = fs.readFileSync(scriptPath, 'utf8');

        expect(script).toContain('function isLocalMigrationTarget');
        expect(script).toContain('const migrationTargetIsLocal = isLocalMigrationTarget(migrationConnectionString)');
        expect(script).toContain('ssl: migrationTargetIsLocal ? false : { rejectUnauthorized: false }');
        expect(script).toContain('let client: PoolClient | null = null');
        expect(script).toContain('client = await migrationPool.connect()');
        expect(script).toContain('client?.release()');
    });
});
