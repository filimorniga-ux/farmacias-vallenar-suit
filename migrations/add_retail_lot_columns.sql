-- Migración: Soporte detallado para Fraccionamiento
-- Añade columnas para identificar lotes al detal y su origen

DO $$ 
BEGIN 
    -- 1. Identificar si es un lote al detal
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_batches' AND column_name='is_retail_lot') THEN
        ALTER TABLE inventory_batches ADD COLUMN is_retail_lot BOOLEAN DEFAULT FALSE;
    END IF;

    -- 2. Referencia al lote de origen
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_batches' AND column_name='original_batch_id') THEN
        ALTER TABLE inventory_batches ADD COLUMN original_batch_id UUID;
    END IF;

    -- 3. Índice para búsquedas rápidas de origen
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_inventory_batches_original_batch') THEN
        CREATE INDEX idx_inventory_batches_original_batch ON inventory_batches(original_batch_id);
    END IF;
END $$;
