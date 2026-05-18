import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    ensureMinimalRuntimeSchema,
    MINIMAL_RUNTIME_COLUMNS,
    MINIMAL_RUNTIME_TABLES,
} from '@/scripts/runtime-schema-contract';

describe('runtime schema contract - sale condition', () => {
    it('asegura products.condicion_venta y normaliza vocabulario legacy', async () => {
        const statements: string[] = [];

        await ensureMinimalRuntimeSchema({
            query: async (sql: string) => {
                statements.push(sql);
                return {};
            },
        });

        const joinedStatements = statements.join('\n');

        expect(MINIMAL_RUNTIME_COLUMNS).toContain('products.condicion_venta');
        expect(joinedStatements).toContain('ALTER TABLE products ADD COLUMN IF NOT EXISTS condicion_venta');
        expect(joinedStatements).toContain("WHEN 'LIBRE' THEN 'VD'");
        expect(joinedStatements).toContain("WHEN 'VENTA_DIRECTA' THEN 'VD'");
        expect(joinedStatements).toContain("WHEN 'RECETA_SIMPLE' THEN 'R'");
        expect(joinedStatements).toContain("WHEN 'RECETA_RETENIDA' THEN 'RR'");
        expect(joinedStatements).toContain("WHEN 'RECETA_CHEQUE' THEN 'RCH'");
        expect(joinedStatements).toContain('products_condicion_venta_canonical');
    });

    it('seed demo declara y puebla condiciones canónicas para el gate local', () => {
        const seedFile = readFileSync(
            join(process.cwd(), 'src/scripts/seed-demo-vallenar.ts'),
            'utf8',
        );

        expect(seedFile).toContain("condicion_venta VARCHAR(10) DEFAULT 'VD'");
        expect(seedFile).toContain('condicion_venta) VALUES');
        expect(seedFile).toContain("condition: 'VD'");
        expect(seedFile).toContain("condition: 'R'");
        expect(seedFile).toContain("condition: 'RR'");
        expect(seedFile).toContain("condition: 'RCH'");
    });

    it('asegura columnas usadas por CRM y RRHH en rehearsal local', async () => {
        const statements: string[] = [];

        await ensureMinimalRuntimeSchema({
            query: async (sql: string) => {
                statements.push(sql);
                return {};
            },
        });

        const joinedStatements = statements.join('\n');

        expect(MINIMAL_RUNTIME_COLUMNS).toEqual(expect.arrayContaining([
            'customers.status',
            'customers.loyalty_points',
            'customers.tags',
            'customers.health_tags',
            'customers.last_visit',
            'users.last_login_at',
            'users.last_login_ip',
            'attendance_logs.method',
            'attendance_logs.observation',
            'attendance_logs.evidence_photo_url',
            'attendance_logs.overtime_minutes',
            'attendance_logs.overtime_approved',
        ]));
        expect(joinedStatements).toContain('ALTER TABLE customers ADD COLUMN IF NOT EXISTS status');
        expect(joinedStatements).toContain('ALTER TABLE customers ADD COLUMN IF NOT EXISTS loyalty_points');
        expect(joinedStatements).toContain('ALTER TABLE customers ADD COLUMN IF NOT EXISTS health_tags');
        expect(joinedStatements).toContain('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip');
        expect(joinedStatements).toContain('ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS method');
        expect(joinedStatements).toContain('ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS overtime_minutes');
        expect(joinedStatements).toContain('ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS overtime_approved');
    });

    it('asegura columnas legacy usadas por dashboard, terminales y notificaciones en rehearsal local', async () => {
        const statements: string[] = [];

        await ensureMinimalRuntimeSchema({
            query: async (sql: string) => {
                statements.push(sql);
                return {};
            },
        });

        const joinedStatements = statements.join('\n');

        expect(MINIMAL_RUNTIME_COLUMNS).toEqual(expect.arrayContaining([
            'cash_register_sessions.terminal_id',
            'cash_register_sessions.user_id',
            'cash_register_sessions.status',
            'cash_register_sessions.opening_amount',
            'cash_register_sessions.opened_at',
            'cash_register_sessions.closed_at',
            'cash_register_sessions.notes',
            'notifications.location_id',
            'notifications.user_id',
            'notifications.action_url',
            'notifications.dedup_key',
            'notifications.is_read',
            'notification_reads.deleted_at',
        ]));
        expect(joinedStatements).toContain('ALTER TABLE cash_register_sessions ADD COLUMN IF NOT EXISTS terminal_id');
        expect(joinedStatements).toContain('ALTER TABLE cash_register_sessions ADD COLUMN IF NOT EXISTS user_id');
        expect(joinedStatements).toContain('ALTER TABLE cash_register_sessions ADD COLUMN IF NOT EXISTS notes');
        expect(joinedStatements).toContain('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id');
        expect(joinedStatements).toContain('ALTER TABLE notification_reads ADD COLUMN IF NOT EXISTS deleted_at');
    });

    it('asegura tablas y columnas de lectura usadas por filtros públicos y analytics ejecutivo', async () => {
        const statements: string[] = [];

        await ensureMinimalRuntimeSchema({
            query: async (sql: string) => {
                statements.push(sql);
                return {};
            },
        });

        const joinedStatements = statements.join('\n');

        expect(MINIMAL_RUNTIME_TABLES).toEqual(expect.arrayContaining([
            'categories',
            'laboratories',
            'therapeutic_actions',
        ]));
        expect(MINIMAL_RUNTIME_COLUMNS).toEqual(expect.arrayContaining([
            'categories.id',
            'categories.name',
            'laboratories.id',
            'laboratories.name',
            'therapeutic_actions.id',
            'therapeutic_actions.name',
            'sale_items.product_id',
            'sale_items.product_name',
            'sale_items.discount_amount',
            'sale_items.timestamp',
            'sale_items.refunded_quantity',
        ]));
        expect(joinedStatements).toContain('CREATE TABLE IF NOT EXISTS categories');
        expect(joinedStatements).toContain('CREATE TABLE IF NOT EXISTS laboratories');
        expect(joinedStatements).toContain('CREATE TABLE IF NOT EXISTS therapeutic_actions');
        expect(joinedStatements).toContain('ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS product_id UUID');
        expect(joinedStatements).toContain('ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS product_name');
        expect(joinedStatements).toContain('ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS discount_amount');
        expect(joinedStatements).toContain('ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS timestamp');
    });

    it('asegura baseline de cierre mensual financiero usado por la ruta App Router', async () => {
        const statements: string[] = [];

        await ensureMinimalRuntimeSchema({
            query: async (sql: string) => {
                statements.push(sql);
                return {};
            },
        });

        const joinedStatements = statements.join('\n');

        expect(MINIMAL_RUNTIME_TABLES).toEqual(expect.arrayContaining([
            'monthly_closings',
            'monthly_closing_entries',
        ]));
        expect(MINIMAL_RUNTIME_COLUMNS).toEqual(expect.arrayContaining([
            'monthly_closings.month',
            'monthly_closings.year',
            'monthly_closings.social_security_cost',
            'monthly_closings.status',
            'monthly_closings.notes',
            'monthly_closing_entries.month',
            'monthly_closing_entries.year',
            'monthly_closing_entries.category',
            'monthly_closing_entries.amount',
            'monthly_closing_entries.created_by',
        ]));
        expect(joinedStatements).toContain('CREATE TABLE IF NOT EXISTS monthly_closings');
        expect(joinedStatements).toContain('CREATE TABLE IF NOT EXISTS monthly_closing_entries');
        expect(joinedStatements).toContain('CREATE UNIQUE INDEX IF NOT EXISTS monthly_closings_month_year_key');
        expect(joinedStatements).toContain('CREATE INDEX IF NOT EXISTS idx_mce_month_year');
    });

    it('asegura columnas usadas por writers de productos e importadores en rehearsal local', async () => {
        const statements: string[] = [];

        await ensureMinimalRuntimeSchema({
            query: async (sql: string) => {
                statements.push(sql);
                return {};
            },
        });

        const joinedStatements = statements.join('\n');
        const seedFile = readFileSync(
            join(process.cwd(), 'src/scripts/seed-demo-vallenar.ts'),
            'utf8',
        );

        expect(MINIMAL_RUNTIME_COLUMNS).toEqual(expect.arrayContaining([
            'products.price_sell_unit',
            'products.cost_net',
            'products.tax_percent',
            'products.stock_minimo_seguridad',
            'products.stock_total',
            'products.laboratory',
            'products.isp_register',
            'products.is_bioequivalent',
            'products.requires_prescription',
            'products.es_frio',
            'products.barcode',
            'products.is_active',
            'products.registration_source',
            'products.is_express_entry',
            'products.created_at',
            'products.updated_at',
            'products.deactivated_at',
            'inventory_batches.barcode',
            'inventory_batches.stock_actual',
            'inventory_batches.units_per_box',
            'inventory_batches.laboratory',
            'inventory_batches.created_at',
            'inventory_batches.is_retail_lot',
        ]));

        expect(joinedStatements).toContain('ALTER TABLE products ADD COLUMN IF NOT EXISTS price_sell_unit');
        expect(joinedStatements).toContain('ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_net');
        expect(joinedStatements).toContain('ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_minimo_seguridad');
        expect(joinedStatements).toContain('ALTER TABLE products ADD COLUMN IF NOT EXISTS is_bioequivalent');
        expect(joinedStatements).toContain('ALTER TABLE products ADD COLUMN IF NOT EXISTS is_express_entry');
        expect(joinedStatements).toContain('ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS barcode');
        expect(joinedStatements).toContain('ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS is_retail_lot');

        expect(seedFile).toContain('ALTER TABLE products ADD COLUMN IF NOT EXISTS price_sell_unit');
        expect(seedFile).toContain('ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_net');
        expect(seedFile).toContain('ALTER TABLE products ADD COLUMN IF NOT EXISTS is_bioequivalent');
        expect(seedFile).toContain('ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS barcode');
        expect(seedFile).toContain('ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS is_retail_lot');
    });

    it('seed demo mantiene tablas mínimas de auditoría para el gate local', () => {
        const seedFile = readFileSync(
            join(process.cwd(), 'src/scripts/seed-demo-vallenar.ts'),
            'utf8',
        );

        expect(seedFile).toContain('CREATE TABLE IF NOT EXISTS audit_action_catalog');
        expect(seedFile).toContain('CREATE TABLE IF NOT EXISTS audit_log');
        expect(seedFile).toContain('INSERT INTO audit_action_catalog');
        expect(seedFile).toContain("'DATA_SYNC'");
        expect(seedFile).toContain("'REPORT_ACCESS'");
        expect(seedFile).toContain("'audit_log'");
        expect(seedFile).toContain('server_timestamp TIMESTAMPTZ DEFAULT NOW()');
        expect(seedFile).toContain('timestamp TIMESTAMPTZ DEFAULT NOW()');
        expect(seedFile).toContain("status VARCHAR(20) DEFAULT 'ACTIVE'");
        expect(seedFile).toContain('loyalty_points INTEGER DEFAULT 0');
        expect(seedFile).toContain("health_tags TEXT[] DEFAULT '{}'::text[]");
        expect(seedFile).toContain('last_login_ip VARCHAR(45)');
    });

    it('asegura baseline Procurement/WMS usado por el rehearsal local', async () => {
        const statements: string[] = [];

        await ensureMinimalRuntimeSchema({
            query: async (sql: string) => {
                statements.push(sql);
                return {};
            },
        });

        const joinedStatements = statements.join('\n');

        expect(MINIMAL_RUNTIME_TABLES).toEqual(expect.arrayContaining([
            'suppliers',
            'product_suppliers',
            'purchase_orders',
            'purchase_order_items',
            'shipments',
            'shipment_items',
        ]));
        expect(MINIMAL_RUNTIME_COLUMNS).toEqual(expect.arrayContaining([
            'suppliers.rut',
            'suppliers.business_name',
            'suppliers.status',
            'product_suppliers.product_id',
            'product_suppliers.supplier_id',
            'product_suppliers.supplier_sku',
            'purchase_orders.supplier_id',
            'purchase_orders.total_amount',
            'purchase_orders.delivery_date',
            'purchase_orders.items',
            'purchase_orders.notes',
            'purchase_order_items.purchase_order_id',
            'purchase_order_items.quantity_ordered',
            'purchase_order_items.quantity_received',
            'shipments.origin_location_id',
            'shipments.destination_location_id',
            'shipments.transport_data',
            'shipments.created_by',
            'shipments.notes',
            'shipment_items.shipment_id',
            'shipment_items.product_id',
            'shipment_items.condition',
            'shipment_items.notes',
        ]));
        expect(joinedStatements).toContain('CREATE TABLE IF NOT EXISTS suppliers');
        expect(joinedStatements).toContain('CREATE TABLE IF NOT EXISTS product_suppliers');
        expect(joinedStatements).toContain('CREATE TABLE IF NOT EXISTS purchase_order_items');
        expect(joinedStatements).toContain('CREATE TABLE IF NOT EXISTS shipments');
        expect(joinedStatements).toContain('CREATE TABLE IF NOT EXISTS shipment_items');
        expect(joinedStatements).toContain('ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS supplier_id');
        expect(joinedStatements).toContain('ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS notes');
        expect(joinedStatements).toContain('CREATE UNIQUE INDEX IF NOT EXISTS product_suppliers_product_id_supplier_id_key');
        expect(MINIMAL_RUNTIME_COLUMNS).not.toContain('purchase_order_items.product_id');
        expect(joinedStatements).not.toContain('ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS product_id');
    });

    it('asegura columnas de Smart Invoice usadas por listado y detalle en rehearsal local', async () => {
        const statements: string[] = [];

        await ensureMinimalRuntimeSchema({
            query: async (sql: string) => {
                statements.push(sql);
                return {};
            },
        });

        const joinedStatements = statements.join('\n');

        expect(MINIMAL_RUNTIME_TABLES).toContain('invoice_parsings');
        expect(MINIMAL_RUNTIME_COLUMNS).toEqual(expect.arrayContaining([
            'invoice_parsings.supplier_rut',
            'invoice_parsings.supplier_name',
            'invoice_parsings.supplier_phone',
            'invoice_parsings.supplier_email',
            'invoice_parsings.document_type',
            'invoice_parsings.invoice_number',
            'invoice_parsings.issue_date',
            'invoice_parsings.due_date',
            'invoice_parsings.total_amount',
            'invoice_parsings.confidence_score',
            'invoice_parsings.total_items',
            'invoice_parsings.mapped_items',
            'invoice_parsings.unmapped_items',
            'invoice_parsings.supplier_id',
            'invoice_parsings.location_id',
            'invoice_parsings.created_by',
            'invoice_parsings.validated_by',
            'invoice_parsings.error_message',
        ]));
        expect(joinedStatements).toContain('CREATE TABLE IF NOT EXISTS invoice_parsings');
        expect(joinedStatements).toContain('ALTER TABLE invoice_parsings ADD COLUMN IF NOT EXISTS location_id UUID');
        expect(joinedStatements).toContain('ALTER TABLE invoice_parsings ADD COLUMN IF NOT EXISTS supplier_phone TEXT');
        expect(joinedStatements).toContain('ALTER TABLE invoice_parsings ADD COLUMN IF NOT EXISTS confidence_score');
        expect(joinedStatements).toContain('ALTER TABLE invoice_parsings ADD COLUMN IF NOT EXISTS original_file_data TEXT');
    });

    it('seed demo limpia tablas Procurement/WMS creadas por el baseline runtime', () => {
        const seedFile = readFileSync(
            join(process.cwd(), 'src/scripts/seed-demo-vallenar.ts'),
            'utf8',
        );

        expect(seedFile).toContain("'shipment_items'");
        expect(seedFile).toContain("'shipments'");
        expect(seedFile).toContain("'purchase_order_items'");
        expect(seedFile).toContain("'purchase_orders'");
        expect(seedFile).toContain("'product_suppliers'");
        expect(seedFile).toContain("'suppliers'");
    });
});
