-- =====================================================
-- MIGRACIÓN 027: Indexación de Claves Foráneas Faltantes
-- Pharma-Synapse v3.1 - Farmacias Vallenar
-- =====================================================

BEGIN;

-- 1. attendance_logs
CREATE INDEX IF NOT EXISTS idx_attendance_logs_overtime_approved_by ON attendance_logs(overtime_approved_by);

-- 2. bodegas
CREATE INDEX IF NOT EXISTS idx_bodegas_sucursal_id ON bodegas(sucursal_id);

-- 3. cash_counts
CREATE INDEX IF NOT EXISTS idx_cash_counts_session_id ON cash_counts(session_id);

-- 4. employee_shifts
CREATE INDEX IF NOT EXISTS idx_employee_shifts_assigned_by ON employee_shifts(assigned_by);
CREATE INDEX IF NOT EXISTS idx_employee_shifts_shift_template_id ON employee_shifts(shift_template_id);

-- 5. financial_accounts
CREATE INDEX IF NOT EXISTS idx_financial_accounts_location_id ON financial_accounts(location_id);

-- 6. cash_movements
CREATE INDEX IF NOT EXISTS idx_cash_movements_terminal_id ON cash_movements(terminal_id);

-- 7. sale_items
CREATE INDEX IF NOT EXISTS idx_sale_items_batch_id ON sale_items(batch_id);

-- 8. terminals
CREATE INDEX IF NOT EXISTS idx_terminals_current_cashier_id ON terminals(current_cashier_id);

-- 9. inventory_imports
CREATE INDEX IF NOT EXISTS idx_inventory_imports_normalized_action_id ON inventory_imports(normalized_action_id);
CREATE INDEX IF NOT EXISTS idx_inventory_imports_normalized_category_id ON inventory_imports(normalized_category_id);
CREATE INDEX IF NOT EXISTS idx_inventory_imports_normalized_lab_id ON inventory_imports(normalized_lab_id);
CREATE INDEX IF NOT EXISTS idx_inventory_imports_product_id ON inventory_imports(product_id);

-- 10. lotes
CREATE INDEX IF NOT EXISTS idx_lotes_bodega_id ON lotes(bodega_id);

-- 11. movimientos_inventario
CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_bodega_id ON movimientos_inventario(bodega_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_lote_id ON movimientos_inventario(lote_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_producto_id ON movimientos_inventario(producto_id);

-- 12. products
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_laboratory_id ON products(laboratory_id);

-- 13. purchase_orders
CREATE INDEX IF NOT EXISTS idx_purchase_orders_approved_by ON purchase_orders(approved_by);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_by ON purchase_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_received_by ON purchase_orders(received_by);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_target_warehouse_id ON purchase_orders(target_warehouse_id);

-- 14. queue_tickets
CREATE INDEX IF NOT EXISTS idx_queue_tickets_customer_id ON queue_tickets(customer_id);

-- 15. quote_items
CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id ON quote_items(quote_id);

-- 16. shift_templates
CREATE INDEX IF NOT EXISTS idx_shift_templates_location_id ON shift_templates(location_id);

-- 17. shipments
CREATE INDEX IF NOT EXISTS idx_shipments_origin_warehouse_id ON shipments(origin_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_shipments_target_warehouse_id ON shipments(target_warehouse_id);

-- 18. time_off_requests
CREATE INDEX IF NOT EXISTS idx_time_off_requests_approved_by ON time_off_requests(approved_by);

-- 19. treasury_remittances
CREATE INDEX IF NOT EXISTS idx_treasury_remittances_location_id ON treasury_remittances(location_id);
CREATE INDEX IF NOT EXISTS idx_treasury_remittances_source_terminal_id ON treasury_remittances(source_terminal_id);

-- 20. treasury_transactions
CREATE INDEX IF NOT EXISTS idx_treasury_transactions_account_id ON treasury_transactions(account_id);

-- 21. ventas
CREATE INDEX IF NOT EXISTS idx_ventas_sucursal_id ON ventas(sucursal_id);

-- Registro de migración
INSERT INTO schema_migrations (version, description, checksum)
VALUES (
    '027_index_foreign_keys',
    'Creación de índices para todas las claves foráneas detectadas como no indexadas por el advisor de Supabase',
    MD5('027_index_foreign_keys.sql')
) ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

COMMIT;
