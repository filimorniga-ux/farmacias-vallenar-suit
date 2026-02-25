import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const migrationPath = path.join(
    process.cwd(),
    'src',
    'db',
    'migrations',
    '023_fix_audit_log_functions_schema_qualified.sql'
);

describe('Migration 023 - Fix audit log functions with search_path hardened', () => {
    it('should exist', () => {
        expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it('should schema-qualify audit references to public.*', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain('FROM public.audit_log');
        expect(sql).toContain('FROM public.audit_action_catalog');
        expect(sql).toContain('INSERT INTO public.audit_log');
    });

    it('should keep immutable search_path and use pg_catalog hash funcs', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain("SET search_path TO ''");
        expect(sql).toContain('pg_catalog.encode');
        expect(sql).toContain('pg_catalog.sha256');
        expect(sql).toContain('pg_catalog.convert_to');
    });
});
