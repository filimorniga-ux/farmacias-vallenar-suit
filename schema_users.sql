-- ========================================
-- TABLA: users (Empleados y Usuarios del Sistema)
-- ========================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rut VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL, -- 'MANAGER', 'QF', 'CASHIER', 'WAREHOUSE', 'ADMIN'
  access_pin VARCHAR(4), -- PIN de 4 dígitos para acceso rápido
  status VARCHAR(20) DEFAULT 'ACTIVE', -- 'ACTIVE', 'ON_LEAVE', 'TERMINATED'
  job_title VARCHAR(100), -- Cargo contractual
  
  -- Datos de contacto y personales
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  
  -- Biometría (Placeholder para credenciales WebAuthn o similar)
  biometric_credentials JSONB DEFAULT '[]',
  
  -- Metadatos
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP
);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_users_rut ON users(rut);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Usuario Admin por defecto (Si no existe)
INSERT INTO users (rut, name, role, access_pin, job_title, status)
VALUES ('11.111.111-1', 'Administrador Inicial', 'MANAGER', '1234', 'GERENTE_GENERAL', 'ACTIVE')
ON CONFLICT (rut) DO NOTHING;
