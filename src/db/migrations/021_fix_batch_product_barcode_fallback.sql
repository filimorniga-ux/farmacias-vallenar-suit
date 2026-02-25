-- Migration 021
-- Repara referencias huérfanas restantes en lotes/movimientos cuando el código viene en barcode
-- y no en products.sku (caso histórico heredado).

BEGIN;

CREATE SCHEMA IF NOT EXISTS maintenance;

CREATE TABLE IF NOT EXISTS maintenance.bk_inv_batches_barcode_fix_20260223
AS
SELECT * FROM inventory_batches WHERE FALSE;

CREATE TABLE IF NOT EXISTS maintenance.bk_shipment_items_barcode_fix_20260223
AS
SELECT * FROM shipment_items WHERE FALSE;

-- ---------------------------------------------------------------------------
-- Backup inventory_batches huérfanos resolvibles por barcode/sku maestro
-- ---------------------------------------------------------------------------
WITH product_codes AS (
    SELECT
        p.id::uuid AS product_uuid,
        p.name AS canonical_name,
        COALESCE(NULLIF(p.sale_price, 0), NULLIF(p.price_sell_box, 0), NULLIF(p.price, 0), 0) AS canonical_sale_price,
        COALESCE(NULLIF(p.cost_price, 0), NULLIF(p.cost_net, 0), 0) AS canonical_cost,
        regexp_replace(NULLIF(BTRIM(p.sku), ''), '\s+', '', 'g') AS code,
        TRUE AS is_primary_sku
    FROM products p
    WHERE p.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'

    UNION ALL

    SELECT
        p.id::uuid AS product_uuid,
        p.name AS canonical_name,
        COALESCE(NULLIF(p.sale_price, 0), NULLIF(p.price_sell_box, 0), NULLIF(p.price, 0), 0) AS canonical_sale_price,
        COALESCE(NULLIF(p.cost_price, 0), NULLIF(p.cost_net, 0), 0) AS canonical_cost,
        NULLIF(BTRIM(code), '') AS code,
        FALSE AS is_primary_sku
    FROM products p
    CROSS JOIN LATERAL regexp_split_to_table(
        regexp_replace(COALESCE(p.barcode, ''), '\s+', '', 'g'),
        ','
    ) AS code
    WHERE p.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
),
canonical_by_code AS (
    SELECT DISTINCT ON (code)
        code,
        product_uuid,
        canonical_name,
        canonical_sale_price,
        canonical_cost
    FROM product_codes
    WHERE code IS NOT NULL AND code <> ''
    ORDER BY
        code,
        is_primary_sku DESC,
        (canonical_sale_price > 0) DESC,
        (canonical_cost > 0) DESC,
        product_uuid DESC
)
INSERT INTO maintenance.bk_inv_batches_barcode_fix_20260223
SELECT ib.*
FROM inventory_batches ib
JOIN canonical_by_code cb
  ON cb.code = regexp_replace(COALESCE(ib.sku, ''), '\s+', '', 'g')
WHERE (
    ib.product_id IS NULL
    OR NOT EXISTS (
        SELECT 1 FROM products p_exist WHERE p_exist.id::text = ib.product_id::text
    )
)
AND NOT EXISTS (
    SELECT 1
    FROM maintenance.bk_inv_batches_barcode_fix_20260223 b
    WHERE b.id = ib.id
);

-- ---------------------------------------------------------------------------
-- Backup shipment_items huérfanos resolvibles por barcode/sku maestro
-- ---------------------------------------------------------------------------
WITH product_codes AS (
    SELECT
        p.id::uuid AS product_uuid,
        regexp_replace(NULLIF(BTRIM(p.sku), ''), '\s+', '', 'g') AS code,
        TRUE AS is_primary_sku
    FROM products p
    WHERE p.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'

    UNION ALL

    SELECT
        p.id::uuid AS product_uuid,
        NULLIF(BTRIM(code), '') AS code,
        FALSE AS is_primary_sku
    FROM products p
    CROSS JOIN LATERAL regexp_split_to_table(
        regexp_replace(COALESCE(p.barcode, ''), '\s+', '', 'g'),
        ','
    ) AS code
    WHERE p.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
),
canonical_by_code AS (
    SELECT DISTINCT ON (code)
        code,
        product_uuid
    FROM product_codes
    WHERE code IS NOT NULL AND code <> ''
    ORDER BY
        code,
        is_primary_sku DESC,
        product_uuid DESC
)
INSERT INTO maintenance.bk_shipment_items_barcode_fix_20260223
SELECT si.*
FROM shipment_items si
JOIN canonical_by_code cb
  ON cb.code = regexp_replace(COALESCE(si.sku, ''), '\s+', '', 'g')
WHERE (
    si.product_id IS NULL
    OR NOT EXISTS (
        SELECT 1 FROM products p_exist WHERE p_exist.id::text = si.product_id::text
    )
)
AND NOT EXISTS (
    SELECT 1
    FROM maintenance.bk_shipment_items_barcode_fix_20260223 b
    WHERE b.id = si.id
);

-- ---------------------------------------------------------------------------
-- Reparar inventory_batches huérfanos por código barcode/sku
-- ---------------------------------------------------------------------------
WITH product_codes AS (
    SELECT
        p.id::uuid AS product_uuid,
        p.name AS canonical_name,
        COALESCE(NULLIF(p.sale_price, 0), NULLIF(p.price_sell_box, 0), NULLIF(p.price, 0), 0) AS canonical_sale_price,
        COALESCE(NULLIF(p.cost_price, 0), NULLIF(p.cost_net, 0), 0) AS canonical_cost,
        regexp_replace(NULLIF(BTRIM(p.sku), ''), '\s+', '', 'g') AS code,
        TRUE AS is_primary_sku
    FROM products p
    WHERE p.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'

    UNION ALL

    SELECT
        p.id::uuid AS product_uuid,
        p.name AS canonical_name,
        COALESCE(NULLIF(p.sale_price, 0), NULLIF(p.price_sell_box, 0), NULLIF(p.price, 0), 0) AS canonical_sale_price,
        COALESCE(NULLIF(p.cost_price, 0), NULLIF(p.cost_net, 0), 0) AS canonical_cost,
        NULLIF(BTRIM(code), '') AS code,
        FALSE AS is_primary_sku
    FROM products p
    CROSS JOIN LATERAL regexp_split_to_table(
        regexp_replace(COALESCE(p.barcode, ''), '\s+', '', 'g'),
        ','
    ) AS code
    WHERE p.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
),
canonical_by_code AS (
    SELECT DISTINCT ON (code)
        code,
        product_uuid,
        canonical_name,
        canonical_sale_price,
        canonical_cost
    FROM product_codes
    WHERE code IS NOT NULL AND code <> ''
    ORDER BY
        code,
        is_primary_sku DESC,
        (canonical_sale_price > 0) DESC,
        (canonical_cost > 0) DESC,
        product_uuid DESC
)
UPDATE inventory_batches ib
SET
    product_id = cb.product_uuid,
    name = COALESCE(NULLIF(ib.name, ''), cb.canonical_name),
    unit_cost = CASE WHEN COALESCE(ib.unit_cost, 0) = 0 THEN cb.canonical_cost ELSE ib.unit_cost END,
    cost_net = CASE WHEN COALESCE(ib.cost_net, 0) = 0 THEN cb.canonical_cost ELSE ib.cost_net END,
    sale_price = CASE WHEN COALESCE(ib.sale_price, 0) = 0 THEN NULLIF(cb.canonical_sale_price, 0) ELSE ib.sale_price END,
    price_sell_box = CASE WHEN COALESCE(ib.price_sell_box, 0) = 0 THEN NULLIF(cb.canonical_sale_price, 0) ELSE ib.price_sell_box END,
    updated_at = NOW()
FROM canonical_by_code cb
WHERE cb.code = regexp_replace(COALESCE(ib.sku, ''), '\s+', '', 'g')
  AND (
      ib.product_id IS NULL
      OR NOT EXISTS (
          SELECT 1 FROM products p_exist WHERE p_exist.id::text = ib.product_id::text
      )
  );

-- ---------------------------------------------------------------------------
-- Reparar shipment_items huérfanos por código barcode/sku
-- ---------------------------------------------------------------------------
WITH product_codes AS (
    SELECT
        p.id::uuid AS product_uuid,
        regexp_replace(NULLIF(BTRIM(p.sku), ''), '\s+', '', 'g') AS code,
        TRUE AS is_primary_sku
    FROM products p
    WHERE p.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'

    UNION ALL

    SELECT
        p.id::uuid AS product_uuid,
        NULLIF(BTRIM(code), '') AS code,
        FALSE AS is_primary_sku
    FROM products p
    CROSS JOIN LATERAL regexp_split_to_table(
        regexp_replace(COALESCE(p.barcode, ''), '\s+', '', 'g'),
        ','
    ) AS code
    WHERE p.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
),
canonical_by_code AS (
    SELECT DISTINCT ON (code)
        code,
        product_uuid
    FROM product_codes
    WHERE code IS NOT NULL AND code <> ''
    ORDER BY
        code,
        is_primary_sku DESC,
        product_uuid DESC
)
UPDATE shipment_items si
SET product_id = cb.product_uuid
FROM canonical_by_code cb
WHERE cb.code = regexp_replace(COALESCE(si.sku, ''), '\s+', '', 'g')
  AND (
      si.product_id IS NULL
      OR NOT EXISTS (
          SELECT 1 FROM products p_exist WHERE p_exist.id::text = si.product_id::text
      )
  );

COMMIT;
