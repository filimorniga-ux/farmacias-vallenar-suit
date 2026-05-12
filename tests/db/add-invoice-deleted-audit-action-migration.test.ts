import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const migrationPath = path.join(
    process.cwd(),
    'src',
    'db',
    'migrations',
    '039_invoice_deleted_audit_action.sql'
);

describe('Migration 039 - Add smart-invoice delete audit action', () => {
    it('should exist in src/db/migrations', () => {
        expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it('should register INVOICE_DELETED in audit_action_catalog', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain('INVOICE_DELETED');
        expect(sql).toContain('audit_action_catalog');
        expect(sql).toContain("'AI'");
    });

    it('should register itself in schema_migrations', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain('INSERT INTO schema_migrations');
        expect(sql).toContain("'039'");
    });
});
