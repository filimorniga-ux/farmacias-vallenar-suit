-- ============================================================
-- Migration: Fix Supabase Advisor Warnings
-- Date: 2026-03-18
-- Fixes: RLS permissive policy, duplicate index, unindexed FKs
-- ============================================================

-- 1. FIX RLS on price_cost_history: Replace permissive USING(true) 
--    with proper role-based policies for authenticated users
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.price_cost_history;

-- SELECT: any authenticated user can read price history
CREATE POLICY "pch_select_authenticated"
  ON public.price_cost_history
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: authenticated users can insert records (user_id must be set)
CREATE POLICY "pch_insert_authenticated"
  ON public.price_cost_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = user_id)
  );

-- UPDATE: only records with valid user_id
CREATE POLICY "pch_update_own"
  ON public.price_cost_history
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = user_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = user_id));

-- DELETE: no one should delete price history (audit trail)
CREATE POLICY "pch_deny_delete"
  ON public.price_cost_history
  FOR DELETE
  TO authenticated
  USING (false);

-- 2. DROP DUPLICATE INDEX on employee_shifts
--    Both indexes are identical: (location_id, status, start_at)
--    Keep idx_employee_shifts_location_status_start_at (more descriptive)
DROP INDEX IF EXISTS public.idx_employee_shifts_location_status;

-- 3. ADD MISSING INDEXES for unindexed foreign keys
CREATE INDEX IF NOT EXISTS idx_pin_resets_created_by 
  ON public.pin_resets (created_by);

CREATE INDEX IF NOT EXISTS idx_refunds_authorized_by 
  ON public.refunds (authorized_by);

CREATE INDEX IF NOT EXISTS idx_refunds_user_id 
  ON public.refunds (user_id);

CREATE INDEX IF NOT EXISTS idx_sales_edit_authorized_by 
  ON public.sales (edit_authorized_by);
