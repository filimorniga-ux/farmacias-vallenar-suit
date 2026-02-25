import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const migrationPath = path.join(
    process.cwd(),
    'src',
    'db',
    'migrations',
    '022_secure_maintenance_backup_tables.sql'
);

describe('Migration 022 - Secure maintenance backup tables', () => {
    it('should exist', () => {
        expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it('should move maintenance backup tables out of public schema', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain("CREATE SCHEMA IF NOT EXISTS maintenance");
        expect(sql).toContain("tablename LIKE 'maintenance_backup%'");
        expect(sql).toContain("ALTER TABLE public.%I SET SCHEMA maintenance");
    });

    it('should revoke external access on maintenance schema', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain('REVOKE ALL ON SCHEMA maintenance FROM PUBLIC');
        expect(sql).toContain('REVOKE ALL ON SCHEMA maintenance FROM anon');
        expect(sql).toContain('REVOKE ALL ON SCHEMA maintenance FROM authenticated');
        expect(sql).toContain('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA maintenance FROM anon');
        expect(sql).toContain('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA maintenance FROM authenticated');
    });
});
