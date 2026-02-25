-- Migration 020
-- Normaliza lotes/movimientos heredados para que apunten al producto maestro correcto por SKU.
-- Objetivo:
--   1) Evitar "productos nuevos fantasma" en inventario por product_id huérfano.
--   2) Reparar precios/costos en lotes recibidos con valores 0 cuando exista referencia maestra.
--
-- Seguridad:
--   - Crea backup de filas afectadas antes de actualizar.
--   - Idempotente: se puede re-ejecutar sin duplicar backups ni corromper datos.

BEGIN;

CREATE SCHEMA IF NOT EXISTS maintenance;

CREATE TABLE IF NOT EXISTS maintenance.bk_inv_batches_prod_fix_20260223
AS
SELECT * FROM inventory_batches WHERE FALSE;

CREATE TABLE IF NOT EXISTS maintenance.bk_shipment_items_prod_fix_20260223
AS
SELECT * FROM shipment_items WHERE FALSE;

-- ---------------------------------------------------------------------------
-- Backup lotes afectados
-- ---------------------------------------------------------------------------
WITH canonical_products AS (
    SELECT DISTINCT ON (p.sku)
        p.sku,
        p.id::uuid AS product_uuid,
        p.name AS canonical_name,
        COALESCE(NULLIF(p.sale_price, 0), NULLIF(p.price_sell_box, 0), NULLIF(p.price, 0), 0) AS canonical_sale_price,
        COALESCE(NULLIF(p.cost_price, 0), NULLIF(p.cost_net, 0), 0) AS canonical_cost
    FROM products p
    WHERE p.sku IS NOT NULL
      AND BTRIM(p.sku) <> ''
      AND p.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ORDER BY
        p.sku,
        (COALESCE(p.sale_price, p.price_sell_box, p.price, 0) > 0) DESC,
        (COALESCE(p.cost_price, p.cost_net, 0) > 0) DESC,
        p.id DESC
)
INSERT INTO maintenance.bk_inv_batches_prod_fix_20260223
SELECT ib.*
FROM inventory_batches ib
JOIN canonical_products cp ON cp.sku = ib.sku
WHERE (
    ib.product_id IS NULL
    OR NOT EXISTS (
        SELECT 1 FROM products p_exist WHERE p_exist.id::text = ib.product_id::text
    )
    OR COALESCE(ib.unit_cost, 0) = 0
    OR COALESCE(ib.cost_net, 0) = 0
    OR COALESCE(ib.sale_price, 0) = 0
    OR COALESCE(ib.price_sell_box, 0) = 0
)
AND NOT EXISTS (
    SELECT 1
    FROM maintenance.bk_inv_batches_prod_fix_20260223 b
    WHERE b.id = ib.id
);

-- ---------------------------------------------------------------------------
-- Backup shipment_items afectados
-- ---------------------------------------------------------------------------
WITH canonical_products AS (
    SELECT DISTINCT ON (p.sku)
        p.sku,
        p.id::uuid AS product_uuid
    FROM products p
    WHERE p.sku IS NOT NULL
      AND BTRIM(p.sku) <> ''
      AND p.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ORDER BY
        p.sku,
        (COALESCE(p.sale_price, p.price_sell_box, p.price, 0) > 0) DESC,
        (COALESCE(p.cost_price, p.cost_net, 0) > 0) DESC,
        p.id DESC
)
INSERT INTO maintenance.bk_shipment_items_prod_fix_20260223
SELECT si.*
FROM shipment_items si
JOIN canonical_products cp ON cp.sku = si.sku
WHERE (
    si.product_id IS NULL
    OR NOT EXISTS (
        SELECT 1 FROM products p_exist WHERE p_exist.id::text = si.product_id::text
    )
)
AND NOT EXISTS (
    SELECT 1
    FROM maintenance.bk_shipment_items_prod_fix_20260223 b
    WHERE b.id = si.id
);

-- ---------------------------------------------------------------------------
-- Reparar inventory_batches
-- ---------------------------------------------------------------------------
WITH canonical_products AS (
    SELECT DISTINCT ON (p.sku)
        p.sku,
        p.id::uuid AS product_uuid,
        p.name AS canonical_name,
        COALESCE(NULLIF(p.sale_price, 0), NULLIF(p.price_sell_box, 0), NULLIF(p.price, 0), 0) AS canonical_sale_price,
        COALESCE(NULLIF(p.cost_price, 0), NULLIF(p.cost_net, 0), 0) AS canonical_cost
    FROM products p
    WHERE p.sku IS NOT NULL
      AND BTRIM(p.sku) <> ''
      AND p.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ORDER BY
        p.sku,
        (COALESCE(p.sale_price, p.price_sell_box, p.price, 0) > 0) DESC,
        (COALESCE(p.cost_price, p.cost_net, 0) > 0) DESC,
        p.id DESC
)
UPDATE inventory_batches ib
SET
    product_id = CASE
        WHEN ib.product_id IS NULL
          OR NOT EXISTS (SELECT 1 FROM products p_exist WHERE p_exist.id::text = ib.product_id::text)
        THEN cp.product_uuid
        ELSE ib.product_id
    END,
    name = COALESCE(NULLIF(ib.name, ''), cp.canonical_name),
    unit_cost = CASE
        WHEN COALESCE(ib.unit_cost, 0) = 0 THEN cp.canonical_cost
        ELSE ib.unit_cost
    END,
    cost_net = CASE
        WHEN COALESCE(ib.cost_net, 0) = 0 THEN cp.canonical_cost
        ELSE ib.cost_net
    END,
    sale_price = CASE
        WHEN COALESCE(ib.sale_price, 0) = 0 THEN NULLIF(cp.canonical_sale_price, 0)
        ELSE ib.sale_price
    END,
    price_sell_box = CASE
        WHEN COALESCE(ib.price_sell_box, 0) = 0 THEN NULLIF(cp.canonical_sale_price, 0)
        ELSE ib.price_sell_box
    END,
    updated_at = NOW()
FROM canonical_products cp
WHERE cp.sku = ib.sku
  AND (
      ib.product_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM products p_exist WHERE p_exist.id::text = ib.product_id::text)
      OR COALESCE(ib.unit_cost, 0) = 0
      OR COALESCE(ib.cost_net, 0) = 0
      OR COALESCE(ib.sale_price, 0) = 0
      OR COALESCE(ib.price_sell_box, 0) = 0
  );

-- ---------------------------------------------------------------------------
-- Reparar shipment_items (referencias de producto para no propagar huérfanos)
-- ---------------------------------------------------------------------------
WITH canonical_products AS (
    SELECT DISTINCT ON (p.sku)
        p.sku,
        p.id::uuid AS product_uuid
    FROM products p
    WHERE p.sku IS NOT NULL
      AND BTRIM(p.sku) <> ''
      AND p.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ORDER BY
        p.sku,
        (COALESCE(p.sale_price, p.price_sell_box, p.price, 0) > 0) DESC,
        (COALESCE(p.cost_price, p.cost_net, 0) > 0) DESC,
        p.id DESC
)
UPDATE shipment_items si
SET product_id = cp.product_uuid
FROM canonical_products cp
WHERE cp.sku = si.sku
  AND (
      si.product_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM products p_exist WHERE p_exist.id::text = si.product_id::text)
  );

COMMIT;
