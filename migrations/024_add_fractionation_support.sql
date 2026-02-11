-- Migración: Soporte para Fraccionamiento (Venta por Detal)
-- Añade columnas necesarias a inventory_batches

DO $$ 
BEGIN 
    -- 1. Unidades por caja (Capacidad de la caja)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_batches' AND column_name='units_per_box') THEN
        ALTER TABLE inventory_batches ADD COLUMN units_per_box INTEGER DEFAULT 1;
    END IF;

    -- 2. Stock actual de unidades sueltas (fraccionadas)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_batches' AND column_name='units_stock_actual') THEN
        ALTER TABLE inventory_batches ADD COLUMN units_stock_actual INTEGER DEFAULT 0;
    END IF;

    -- 3. Flag de si es fraccionable (por si queremos restringir)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_batches' AND column_name='is_fractionable') THEN
        ALTER TABLE inventory_batches ADD COLUMN is_fractionable BOOLEAN DEFAULT TRUE;
    END IF;

    -- 4. Precio fraccionado (opcional, si difiere del proporcional)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_batches' AND column_name='fractional_price') THEN
        ALTER TABLE inventory_batches ADD COLUMN fractional_price INTEGER;
    END IF;
END $$;
