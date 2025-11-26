-- ========================================
-- TABLA: configuracion_global
-- ========================================
CREATE TABLE IF NOT EXISTS configuracion_global (
    id SERIAL PRIMARY KEY,
    clave VARCHAR(50) UNIQUE NOT NULL,
    valor_bool BOOLEAN,
    valor_text TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insertar configuración inicial de turno si no existe
INSERT INTO configuracion_global (clave, valor_bool)
VALUES ('en_turno', FALSE)
ON CONFLICT (clave) DO NOTHING;

-- ========================================
-- TABLA: asistencia (Reloj Control)
-- ========================================
CREATE TABLE IF NOT EXISTS asistencia (
    id SERIAL PRIMARY KEY,
    usuario VARCHAR(255) NOT NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('ENTRADA', 'SALIDA')),
    fecha_hora TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- TABLA: cola_atencion (Gestor de Filas)
-- ========================================
CREATE TABLE IF NOT EXISTS cola_atencion (
    id SERIAL PRIMARY KEY,
    numero_ticket VARCHAR(20) NOT NULL,
    estado VARCHAR(20) DEFAULT 'ESPERA' CHECK (estado IN ('ESPERA', 'LLAMADO', 'ATENDIDO')),
    fecha_creacion TIMESTAMP DEFAULT NOW(),
    fecha_atencion TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cola_estado ON cola_atencion(estado);
CREATE INDEX IF NOT EXISTS idx_cola_fecha ON cola_atencion(fecha_creacion);
