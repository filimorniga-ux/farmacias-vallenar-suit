type Queryable = {
    query: (sql: string, params?: unknown[]) => Promise<unknown>;
};

export const MINIMAL_RUNTIME_TABLES = [
    'purchase_orders',
    'app_settings',
    'system_configs',
    'cash_register_sessions',
    'financial_accounts',
    'treasury_transactions',
    'treasury_remittances',
    'refunds',
    'notifications',
    'notification_reads',
    'attendance_logs',
] as const;

export const MINIMAL_RUNTIME_COLUMNS = [
    'sales.status',
    'sales.session_id',
    'locations.email',
    'locations.manager_id',
    'locations.config',
    'products.category',
    'products.dci',
    'products.units_per_box',
    'products.price_sell_box',
    'products.format',
    'terminals.is_active',
    'terminals.config',
    'terminals.printer_config',
    'terminals.module_number',
    'terminals.deleted_at',
    'terminals.current_cashier_id',
    'terminals.session_id',
    'cash_register_sessions.closed_by_user_id',
    'cash_movements.session_id',
    'sale_items.refunded_quantity',
] as const;

const RUNTIME_SCHEMA_STATEMENTS = [
    `CREATE EXTENSION IF NOT EXISTS pgcrypto`,

    `CREATE TABLE IF NOT EXISTS purchase_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        target_warehouse_id UUID,
        status VARCHAR(50) DEFAULT 'PENDING',
        created_by TEXT,
        approved_by TEXT,
        received_by TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS system_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        config_key TEXT UNIQUE NOT NULL,
        config_value TEXT,
        is_encrypted BOOLEAN NOT NULL DEFAULT false,
        config_type TEXT NOT NULL DEFAULT 'STRING',
        description TEXT,
        category TEXT,
        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS cash_register_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        terminal_id UUID,
        user_id TEXT,
        status VARCHAR(50) DEFAULT 'OPEN',
        opening_amount NUMERIC(15, 2) DEFAULT 0,
        closing_amount NUMERIC(15, 2) DEFAULT 0,
        opened_at TIMESTAMP DEFAULT NOW(),
        closed_at TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS financial_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        location_id UUID,
        name VARCHAR(255),
        type VARCHAR(50),
        balance NUMERIC(15, 2) DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS treasury_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id UUID,
        amount NUMERIC(15, 2) DEFAULT 0,
        type VARCHAR(50) DEFAULT 'IN',
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        created_by TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS treasury_remittances (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        location_id UUID,
        terminal_id UUID,
        source_terminal_id UUID,
        cashier_id TEXT,
        received_by TEXT,
        created_by TEXT,
        amount NUMERIC(15, 2) DEFAULT 0,
        cash_count_diff NUMERIC(15, 2) DEFAULT 0,
        status VARCHAR(50) DEFAULT 'PENDING_RECEIPT',
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS refunds (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_id UUID,
        terminal_id UUID,
        session_id UUID,
        location_id UUID,
        user_id TEXT,
        ticket_number TEXT,
        total_amount NUMERIC(15, 2) DEFAULT 0,
        refund_method VARCHAR(50) DEFAULT 'CASH',
        status VARCHAR(50) DEFAULT 'COMPLETED',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
        severity VARCHAR(50) NOT NULL DEFAULT 'INFO',
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,
        location_id UUID,
        user_id UUID,
        action_url TEXT,
        dedup_key TEXT UNIQUE,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS notification_reads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        notification_id UUID,
        user_id UUID,
        read_at TIMESTAMPTZ,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS attendance_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        location_id UUID,
        type VARCHAR(50),
        timestamp TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
    )`,

    `ALTER TABLE sales ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'COMPLETED'`,
    `ALTER TABLE sales ADD COLUMN IF NOT EXISTS session_id UUID`,
    `ALTER TABLE locations ADD COLUMN IF NOT EXISTS email VARCHAR(255)`,
    `ALTER TABLE locations ADD COLUMN IF NOT EXISTS manager_id UUID`,
    `ALTER TABLE locations ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100)`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS dci TEXT`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS units_per_box INTEGER DEFAULT 1`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS price_sell_box NUMERIC(15, 2)`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS format VARCHAR(50) DEFAULT 'CAJA'`,
    `ALTER TABLE terminals ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`,
    `ALTER TABLE terminals ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb`,
    `ALTER TABLE terminals ADD COLUMN IF NOT EXISTS printer_config JSONB DEFAULT '{}'::jsonb`,
    `ALTER TABLE terminals ADD COLUMN IF NOT EXISTS module_number VARCHAR(50)`,
    `ALTER TABLE terminals ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`,
    `ALTER TABLE terminals ADD COLUMN IF NOT EXISTS current_cashier_id UUID`,
    `ALTER TABLE terminals ADD COLUMN IF NOT EXISTS session_id UUID`,
    `ALTER TABLE cash_register_sessions ADD COLUMN IF NOT EXISTS closed_by_user_id TEXT`,
    `ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS session_id UUID`,
    `ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS refunded_quantity INTEGER DEFAULT 0`,
] as const;

export async function ensureMinimalRuntimeSchema(client: Queryable) {
    for (const statement of RUNTIME_SCHEMA_STATEMENTS) {
        await client.query(statement);
    }
}
