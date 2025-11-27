-- Seed Data for Products Table (DS 466 Compliance)
-- Author: Antigravity
-- Date: 2025-11-27

DELETE FROM products WHERE true;

INSERT INTO products (
    sku, name, dci, laboratory, isp_register, format, units_per_box, is_bioequivalent, 
    price, stock_total, es_frio, comisionable, stock_minimo_seguridad, condicion_venta
) VALUES
-- Paracetamol
('780001', 'PARACETAMOL 500MG', 'PARACETAMOL', 'Mintlab', 'F-1234/20', 'Comprimido', 16, TRUE, 990, 2000, FALSE, FALSE, 200, 'VD'),

-- Losartán
('780002', 'LOSARTÁN 50MG', 'LOSARTÁN POTÁSICO', 'Lab Chile', 'F-9988/21', 'Comprimido', 30, TRUE, 2990, 500, FALSE, FALSE, 100, 'R'),

-- Ibuprofeno
('780003', 'IBUPROFENO 600MG', 'IBUPROFENO', 'Lab Chile', 'F-5544/19', 'Comprimido', 20, TRUE, 1990, 800, FALSE, FALSE, 100, 'VD'),

-- Eutirox
('780004', 'EUTIROX 100MCG', 'LEVOTIROXINA', 'Merck', 'F-2211/18', 'Comprimido', 50, FALSE, 8500, 150, FALSE, FALSE, 30, 'R'),

-- Maam Crema
('RET-01', 'MAAM CREMA PRENATAL', 'N/A', 'Milab', 'N/A', 'Crema', 1, FALSE, 15847, 40, FALSE, TRUE, 10, 'VD');

-- Verify
SELECT * FROM products;
