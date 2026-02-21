-- =====================================================
-- MIGRACIÓN 017: Normalizar location_id en inventory_batches
-- Caso: lotes asociados a warehouse de una ubicación activa,
-- pero con location_id apuntando a una ubicación inactiva.
-- =====================================================

BEGIN;

UPDATE inventory_batches ib
SET location_id = w.location_id
FROM warehouses w, locations l_old, locations l_new
WHERE w.id = ib.warehouse_id
  AND l_old.id = ib.location_id
  AND l_new.id = w.location_id
  AND ib.location_id IS DISTINCT FROM w.location_id
  AND l_old.is_active = false
  AND l_new.is_active = true;

COMMIT;

