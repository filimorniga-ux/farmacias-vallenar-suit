-- Relax constraints on products table
ALTER TABLE products ALTER COLUMN dci DROP NOT NULL;
ALTER TABLE products ALTER COLUMN laboratory DROP NOT NULL;
ALTER TABLE products ALTER COLUMN isp_register DROP NOT NULL;
ALTER TABLE products ALTER COLUMN format DROP NOT NULL;
ALTER TABLE products ALTER COLUMN cost_net SET DEFAULT 0;
ALTER TABLE products ALTER COLUMN units_per_box SET DEFAULT 1;
ALTER TABLE products ALTER COLUMN stock_minimo_seguridad SET DEFAULT 0;

-- Ensure category defaults to 'MEDICAMENTO' if null (though it might be NOT NULL)
ALTER TABLE products ALTER COLUMN category SET DEFAULT 'MEDICAMENTO';

-- Relax constraints on lotes table (if it exists and is used)
-- Note: If lotes table does not exist or has different structure, these might fail.
-- We wrap in a DO block to avoid errors if table doesn't exist, or just execute and ignore if it fails (manual run).
-- For now, we focus on products table which is the main blocker.
