-- DEFINICIÓN DE TERMINALES FÍSICOS
CREATE TABLE IF NOT EXISTS terminals (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL, -- Ej: "Caja 1 - Entrada"
    location_id VARCHAR(100),
    status VARCHAR(20) DEFAULT 'CLOSED' -- OPEN, CLOSED
);

-- DEFINICIÓN DE TURNOS (SESSIONS)
CREATE TABLE IF NOT EXISTS shifts (
    id VARCHAR(50) PRIMARY KEY,
    terminal_id VARCHAR(50) REFERENCES terminals(id),
    user_id VARCHAR(50) REFERENCES users(id), -- El cajero
    authorized_by VARCHAR(50), -- El Gerente que abrió
    start_time TIMESTAMP DEFAULT NOW(),
    end_time TIMESTAMP,
    opening_amount INT NOT NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    closing_amount INT,
    difference INT
);

-- DEFINICIÓN DE COTIZACIONES
CREATE TABLE IF NOT EXISTS quotes (
    id VARCHAR(50) PRIMARY KEY, -- Usar formato corto para barcode: COT-123456
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP, -- 30 días
    customer_id VARCHAR(50),
    total_amount INT,
    status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, CONVERTED, EXPIRED
    items JSONB -- Guardar detalle snapshot
);

-- ACTUALIZAR VENTAS
ALTER TABLE sales ADD COLUMN IF NOT EXISTS shift_id VARCHAR(50); -- Vincular venta al turno específico
