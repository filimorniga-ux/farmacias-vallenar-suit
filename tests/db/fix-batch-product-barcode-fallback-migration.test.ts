import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const migrationPath = path.join(
    process.cwd(),
    'src',
    'db',
    'migrations',
    '021_fix_batch_product_barcode_fallback.sql'
);

describe('Migration 021 - Barcode fallback for orphan batch products', () => {
    it('should exist', () => {
        expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it('should backup affected rows before updating', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS maintenance');
        expect(sql).toContain('maintenance.bk_inv_batches_barcode_fix_20260223');
        expect(sql).toContain('maintenance.bk_shipment_items_barcode_fix_20260223');
        expect(sql).toContain('INSERT INTO maintenance.bk_inv_batches_barcode_fix_20260223');
        expect(sql).toContain('INSERT INTO maintenance.bk_shipment_items_barcode_fix_20260223');
    });

    it('should map orphan rows using sku/barcode normalized code', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain('regexp_split_to_table');
        expect(sql).toContain('regexp_replace(COALESCE(p.barcode, \'\'), \'\\s+\', \'\', \'g\')');
        expect(sql).toContain('UPDATE inventory_batches');
        expect(sql).toContain('UPDATE shipment_items');
    });
});
