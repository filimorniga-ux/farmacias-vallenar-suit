-- ============================================================================
-- 024_purchase_order_review_flow.sql
-- Flujo de recepción por etapas: RECEPCION -> REVIEW -> RECEIVED
-- ============================================================================

BEGIN;

ALTER TABLE IF EXISTS public.purchase_orders
    ADD COLUMN IF NOT EXISTS approved_by UUID;

ALTER TABLE IF EXISTS public.purchase_orders
    ADD COLUMN IF NOT EXISTS received_by UUID;

ALTER TABLE IF EXISTS public.purchase_order_items
    ADD COLUMN IF NOT EXISTS quantity_received INTEGER NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS public.purchase_order_items
    ADD COLUMN IF NOT EXISTS lot_number TEXT;

ALTER TABLE IF EXISTS public.purchase_order_items
    ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_status_target_warehouse
    ON public.purchase_orders (status, target_warehouse_id);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po_sku
    ON public.purchase_order_items (purchase_order_id, sku);

COMMIT;
