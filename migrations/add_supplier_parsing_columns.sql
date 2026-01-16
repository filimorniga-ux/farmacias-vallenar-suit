-- Agregar columnas de datos ricos de proveedor a la tabla de parsings de facturas

ALTER TABLE invoice_parsings
ADD COLUMN IF NOT EXISTS supplier_phone TEXT,
ADD COLUMN IF NOT EXISTS supplier_email TEXT,
ADD COLUMN IF NOT EXISTS supplier_website TEXT,
ADD COLUMN IF NOT EXISTS supplier_activity TEXT,
ADD COLUMN IF NOT EXISTS supplier_fantasy_name TEXT,
ADD COLUMN IF NOT EXISTS supplier_address TEXT; -- Ya existía, pero por seguridad
