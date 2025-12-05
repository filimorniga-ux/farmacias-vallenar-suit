-- Añadir columnas faltantes a la tabla users
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS biometric_credentials JSONB DEFAULT '[]';
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;

-- Actualizar usuarios existentes con valores por defecto si es necesario
UPDATE users SET job_title = 'GERENTE_GENERAL' WHERE role = 'MANAGER' AND job_title IS NULL;
UPDATE users SET job_title = 'CAJERO_VENDEDOR' WHERE role = 'CASHIER' AND job_title IS NULL;
