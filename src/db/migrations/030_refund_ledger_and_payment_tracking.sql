-- =============================================================
-- Migration 030: Refund Ledger and Payment Tracking
-- Farmacias Vallenar - Pharma-Synapse v3.1
--
-- Objetivo:
-- 1) Registrar devoluciones como transacciones financieras trazables
-- 2) Guardar medio de devolución (cash/debit/credit/transfer)
-- 3) Permitir impacto correcto en arqueo/cierre/handover por método
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    user_id VARCHAR NOT NULL REFERENCES public.users(id),
    authorized_by VARCHAR REFERENCES public.users(id),
    session_id UUID NOT NULL,
    terminal_id UUID NOT NULL,
    location_id UUID NOT NULL,
    total_amount NUMERIC(15,2) NOT NULL CHECK (total_amount >= 0),
    refund_method VARCHAR(20) NOT NULL CHECK (refund_method IN ('CASH', 'DEBIT', 'CREDIT', 'TRANSFER')),
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED')),
    ticket_number VARCHAR(60) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_ticket_number
    ON public.refunds(ticket_number);

CREATE INDEX IF NOT EXISTS idx_refunds_sale_id
    ON public.refunds(sale_id);

CREATE INDEX IF NOT EXISTS idx_refunds_session_id
    ON public.refunds(session_id);

CREATE INDEX IF NOT EXISTS idx_refunds_terminal_id
    ON public.refunds(terminal_id);

CREATE INDEX IF NOT EXISTS idx_refunds_location_id
    ON public.refunds(location_id);

CREATE INDEX IF NOT EXISTS idx_refunds_method_created
    ON public.refunds(refund_method, created_at DESC);

CREATE TABLE IF NOT EXISTS public.refund_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    refund_id UUID NOT NULL REFERENCES public.refunds(id) ON DELETE CASCADE,
    sale_item_id UUID NOT NULL,
    batch_id UUID,
    product_name TEXT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    amount NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refund_items_refund_id
    ON public.refund_items(refund_id);

CREATE INDEX IF NOT EXISTS idx_refund_items_sale_item_id
    ON public.refund_items(sale_item_id);

DO $$
DECLARE
    sale_items_id_attnum SMALLINT;
BEGIN
    SELECT attnum
      INTO sale_items_id_attnum
      FROM pg_attribute
     WHERE attrelid = 'public.sale_items'::regclass
       AND attname = 'id'
       AND NOT attisdropped
       AND attnum > 0
     LIMIT 1;

    IF sale_items_id_attnum IS NOT NULL
       AND EXISTS (
           SELECT 1
             FROM pg_constraint
            WHERE conrelid = 'public.sale_items'::regclass
              AND contype IN ('p', 'u')
              AND conkey = ARRAY[sale_items_id_attnum]
       )
       AND NOT EXISTS (
           SELECT 1 FROM pg_constraint WHERE conname = 'fk_refund_items_sale_item_id'
       )
    THEN
        ALTER TABLE public.refund_items
            ADD CONSTRAINT fk_refund_items_sale_item_id
            FOREIGN KEY (sale_item_id) REFERENCES public.sale_items(id) ON DELETE RESTRICT;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_refunds_session_id'
    ) THEN
        ALTER TABLE public.refunds
            ADD CONSTRAINT fk_refunds_session_id
            FOREIGN KEY (session_id) REFERENCES public.cash_register_sessions(id) ON DELETE RESTRICT;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_refunds_terminal_id'
    ) THEN
        ALTER TABLE public.refunds
            ADD CONSTRAINT fk_refunds_terminal_id
            FOREIGN KEY (terminal_id) REFERENCES public.terminals(id) ON DELETE RESTRICT;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_refunds_location_id'
    ) THEN
        ALTER TABLE public.refunds
            ADD CONSTRAINT fk_refunds_location_id
            FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE RESTRICT;
    END IF;
END $$;

COMMIT;
