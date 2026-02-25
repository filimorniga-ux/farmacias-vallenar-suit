import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const migrationPath = path.join(
    process.cwd(),
    'src',
    'db',
    'migrations',
    '020_fix_batch_product_canonicalization.sql'
);

describe('Migration 020 - Fix batch product canonicalization', () => {
    it('should exist', () => {
        expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it('should backup affected rows before repair', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS maintenance');
        expect(sql).toContain('maintenance.bk_inv_batches_prod_fix_20260223');
        expect(sql).toContain('maintenance.bk_shipment_items_prod_fix_20260223');
        expect(sql).toContain('INSERT INTO maintenance.bk_inv_batches_prod_fix_20260223');
        expect(sql).toContain('INSERT INTO maintenance.bk_shipment_items_prod_fix_20260223');
    });

    it('should repair both product references and commercial values', () => {
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain('UPDATE inventory_batches');
        expect(sql).toContain('product_id = CASE');
        expect(sql).toContain('sale_price = CASE');
        expect(sql).toContain('price_sell_box = CASE');
        expect(sql).toContain('unit_cost = CASE');
        expect(sql).toContain('UPDATE shipment_items');
    });
});
