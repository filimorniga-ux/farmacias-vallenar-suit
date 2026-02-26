-- =============================================================
-- Migration 029: Sale Edit Support
-- Farmacias Vallenar - Pharma-Synapse v3.1
--
-- Agrega soporte para edición supervisada de ventas:
-- 1. Columnas de tracking de edición en tabla sales
-- 2. Acción SALE_EDIT en catálogo de auditoría
-- =============================================================

-- 1. Columnas de tracking de edición en sales
-- Note: users.id is character varying, so edited_by / edit_authorized_by use VARCHAR
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS edited_at             TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS edited_by             VARCHAR REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS edit_authorized_by    VARCHAR REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS edit_reason           TEXT;

-- 2. Índices para consultas de ventas editadas (reportes de auditoría)
CREATE INDEX IF NOT EXISTS idx_sales_edited_at
    ON public.sales (edited_at)
    WHERE edited_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_edited_by
    ON public.sales (edited_by)
    WHERE edited_by IS NOT NULL;

-- 3. Registrar acción SALE_EDIT en catálogo de auditoría
INSERT INTO public.audit_action_catalog (
    code,
    description,
    category,
    severity,
    requires_justification,
    retention_days
)
VALUES (
    'SALE_EDIT',
    'Edición de ítems de venta por supervisor (corrección de errores de caja)',
    'FINANCIAL',
    'HIGH',
    true,
    2555   -- 7 años según requisitos SII Chile
)
ON CONFLICT (code) DO NOTHING;
