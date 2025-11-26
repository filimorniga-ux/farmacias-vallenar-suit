-- ========================================
-- FARMACIAS VALLENAR - FULL INVENTORY SEED
-- ========================================
-- This script populates the database with real pharmacy products
-- including medications, controlled substances, cold chain items, and retail products

-- Clean existing data
DELETE FROM inventory_batches WHERE true;

-- Insert Real Inventory Data
-- ==========================

-- TOP VENTAS & CRÓNICOS
INSERT INTO inventory_batches (id, sku, name, dci, laboratory, brand, image_url, is_bioequivalent, condition, location_id, aisle, stock_actual, stock_min, stock_max, expiry_date, price, cost_price, supplier_id, category, allows_commission, active_ingredients, created_at, updated_at)
VALUES
('P001', '780001', 'PARACETAMOL 500MG', 'PARACETAMOL', 'Lab Chile', NULL, NULL, true, 'VD', 'SUCURSAL_CENTRO', 'GÓNDOLA', 2000, 200, 3000, '2026-12-01', 990, 400, NULL, 'MEDICAMENTO', false, ARRAY['Paracetamol'], NOW(), NOW()),
('P002', '780002', 'LOSARTÁN 50MG', 'LOSARTÁN POTÁSICO', 'Lab Chile', NULL, NULL, true, 'R', 'SUCURSAL_CENTRO', 'ESTANTE A1', 500, 100, 800, '2025-06-01', 2990, 1000, NULL, 'MEDICAMENTO', false, ARRAY['Losartán Potásico'], NOW(), NOW()),
('P003', '780003', 'IBUPROFENO 600MG', 'IBUPROFENO', 'Lab Chile', NULL, NULL, true, 'VD', 'SUCURSAL_CENTRO', 'ESTANTE A2', 800, 100, 1200, '2026-01-01', 1990, 600, NULL, 'MEDICAMENTO', false, ARRAY['Ibuprofeno'], NOW(), NOW()),
('P004', '780004', 'EUTIROX 100MCG', 'LEVOTIROXINA', 'Merck', NULL, NULL, false, 'R', 'SUCURSAL_CENTRO', 'ESTANTE B1', 150, 30, 300, '2025-10-01', 8500, 3500, NULL, 'MEDICAMENTO', false, ARRAY['Levotiroxina'], NOW(), NOW());

-- CONTROLADOS (Receta Retenida / Receta Cheque)
INSERT INTO inventory_batches (id, sku, name, dci, laboratory, brand, image_url, is_bioequivalent, condition, location_id, aisle, stock_actual, stock_min, stock_max, expiry_date, price, cost_price, supplier_id, category, allows_commission, active_ingredients, created_at, updated_at)
VALUES
('C001', 'CTRL-01', 'ZOPICLONA 7.5MG', 'ZOPICLONA', 'Saval', NULL, NULL, true, 'RR', 'SUCURSAL_CENTRO', 'SEGURIDAD', 60, 20, 100, '2025-08-01', 4500, 2000, NULL, 'MEDICAMENTO', false, ARRAY['Zopiclona'], NOW(), NOW()),
('C002', 'CTRL-02', 'RAVOTRIL 2MG', 'CLONAZEPAM', 'Roche', NULL, NULL, false, 'RCH', 'SUCURSAL_CENTRO', 'CAJA FUERTE', 15, 5, 30, '2025-12-01', 12900, 6000, NULL, 'MEDICAMENTO', false, ARRAY['Clonazepam'], NOW(), NOW()),
('C003', 'CTRL-03', 'TRAMADOL GOTAS', 'TRAMADOL', 'Mintlab', NULL, NULL, true, 'RR', 'SUCURSAL_CENTRO', 'SEGURIDAD', 30, 10, 60, '2026-02-01', 3500, 1500, NULL, 'MEDICAMENTO', false, ARRAY['Tramadol'], NOW(), NOW());

-- CADENA DE FRÍO (Requieren refrigeración)
INSERT INTO inventory_batches (id, sku, name, dci, laboratory, brand, image_url, is_bioequivalent, condition, location_id, aisle, stock_actual, stock_min, stock_max, expiry_date, price, cost_price, supplier_id, category, allows_commission, active_ingredients, created_at, updated_at)
VALUES
('F001', 'FRIO-01', 'INSULINA NPH', 'INSULINA HUMANA', 'Novo Nordisk', NULL, NULL, false, 'R', 'SUCURSAL_CENTRO', 'REFRI-01', 25, 10, 50, '2025-04-01', 15990, 8000, NULL, 'MEDICAMENTO', false, ARRAY['Insulina Humana'], NOW(), NOW()),
('F002', 'FRIO-02', 'INSULINA GLARGINA', 'INSULINA', 'Sanofi', NULL, NULL, false, 'R', 'SUCURSAL_CENTRO', 'REFRI-01', 10, 5, 25, '2025-05-01', 25000, 12000, NULL, 'MEDICAMENTO', false, ARRAY['Insulina Glargina'], NOW(), NOW());

-- LAB CHILE & GENÉRICOS
INSERT INTO inventory_batches (id, sku, name, dci, laboratory, brand, image_url, is_bioequivalent, condition, location_id, aisle, stock_actual, stock_min, stock_max, expiry_date, price, cost_price, supplier_id, category, allows_commission, active_ingredients, created_at, updated_at)
VALUES
('G001', 'LC-001', 'ACICLOVIR 200MG', 'ACICLOVIR', 'Lab Chile', NULL, NULL, true, 'R', 'SUCURSAL_CENTRO', 'GENERICOS-A', 100, 20, 200, '2026-03-01', 2167, 800, NULL, 'MEDICAMENTO', false, ARRAY['Aciclovir'], NOW(), NOW()),
('G002', 'LC-002', 'NAPROXENO 550MG', 'NAPROXENO', 'Lab Chile', NULL, NULL, true, 'VD', 'SUCURSAL_CENTRO', 'GENERICOS-N', 120, 30, 250, '2026-07-01', 1208, 500, NULL, 'MEDICAMENTO', false, ARRAY['Naproxeno'], NOW(), NOW()),
('G003', 'LC-003', 'OMEPRAZOL 20MG', 'OMEPRAZOL', 'Lab Chile', NULL, NULL, true, 'VD', 'SUCURSAL_CENTRO', 'GENERICOS-O', 500, 100, 800, '2026-09-01', 893, 350, NULL, 'MEDICAMENTO', false, ARRAY['Omeprazol'], NOW(), NOW()),
('G004', 'LC-004', 'KITADOL 1000MG', 'PARACETAMOL', 'Lab Chile', NULL, NULL, true, 'VD', 'SUCURSAL_CENTRO', 'INFANTIL', 80, 20, 150, '2026-01-01', 5295, 2000, NULL, 'MEDICAMENTO', false, ARRAY['Paracetamol'], NOW(), NOW());

-- RETAIL & COMISIONABLES (Ley Anti-Canela: allows_commission = TRUE)
INSERT INTO inventory_batches (id, sku, name, dci, laboratory, brand, image_url, is_bioequivalent, condition, location_id, aisle, stock_actual, stock_min, stock_max, expiry_date, price, cost_price, supplier_id, category, allows_commission, active_ingredients, created_at, updated_at)
VALUES
('R001', 'RET-01', 'MAAM CREMA PRENATAL', 'COSMETICO', 'Maam', 'Maam', '/images/maam.jpg', false, 'VD', 'SUCURSAL_CENTRO', 'BELLEZA', 40, 10, 80, '2027-01-01', 15847, 8000, NULL, 'RETAIL_BELLEZA', true, ARRAY[]::text[], NOW(), NOW()),
('R002', 'RET-02', 'SIMILAC 1 FÓRMULA', 'ALIMENTO', 'Abbott', 'Similac', NULL, false, 'VD', 'SUCURSAL_CENTRO', 'MATERNIDAD', 20, 5, 50, '2025-02-01', 22990, 12000, NULL, 'RETAIL_BELLEZA', true, ARRAY[]::text[], NOW(), NOW()),
('R003', 'RET-03', 'EUCERIN PROTECTOR 50+', 'COSMETICO', 'Eucerin', 'Eucerin', NULL, false, 'VD', 'SUCURSAL_CENTRO', 'SOLARES', 30, 5, 60, '2027-05-01', 18990, 10000, NULL, 'RETAIL_BELLEZA', true, ARRAY[]::text[], NOW(), NOW()),
('R004', 'RET-04', 'LAUNOL SHAMPOO', 'PEDICULICIDA', 'Launol', 'Launol', NULL, false, 'VD', 'SUCURSAL_CENTRO', 'CAPILAR', 25, 5, 50, '2026-11-01', 5528, 2500, NULL, 'RETAIL_BELLEZA', true, ARRAY[]::text[], NOW(), NOW());

-- Verification Query
SELECT 
    category,
    condition,
    allows_commission,
    COUNT(*) as total_productos,
    SUM(stock_actual * cost_price) as valor_total_stock
FROM inventory_batches
GROUP BY category, condition, allows_commission
ORDER BY category, condition;

-- Summary
SELECT 
    'TOTAL PRODUCTOS' as descripcion,
    COUNT(*) as cantidad,
    SUM(stock_actual) as stock_total,
    SUM(stock_actual * cost_price) as valor_inventario
FROM inventory_batches;
