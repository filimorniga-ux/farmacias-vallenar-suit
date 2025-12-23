-- ============================================================================
-- MIGRACIÓN 007: Seguridad - Hash de PIN con bcrypt
-- Pharma-Synapse v3.1 - Security Hardening
-- ============================================================================
-- 
-- DESCRIPCIÓN:
--   Agrega columna para almacenar PIN hasheado con bcrypt.
--   Los PINs en texto plano serán migrados via script Node.js.
--
-- PRERREQUISITOS:
--   - Ejecutar en ventana de mantenimiento
--   - Backup completo de tabla users
--
-- POST-MIGRACIÓN:
--   - Ejecutar: npm run migrate:pins (src/scripts/migrate-pins-to-bcrypt.ts)
--   - Verificar que todos los usuarios pueden autenticarse
--
-- ============================================================================

-- 1. Agregar columna para PIN hasheado
-- VARCHAR(60) es suficiente para bcrypt hashes ($2a$10$...)
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_pin_hash VARCHAR(60);

COMMENT ON COLUMN users.access_pin_hash IS 'PIN hasheado con bcrypt. Reemplaza access_pin en texto plano.';

-- 2. Agregar columnas de auditoría de login si no existen
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(45);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

COMMENT ON COLUMN users.last_login_at IS 'Timestamp del último login exitoso';
COMMENT ON COLUMN users.last_login_ip IS 'IP del último login exitoso';
COMMENT ON COLUMN users.is_active IS 'Si el usuario puede autenticarse';

-- 3. Crear índice para búsquedas de usuarios activos
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active) WHERE is_active = true;

-- 4. Agregar constraint para asegurar que al menos uno de los PINs existe (temporal)
-- Se removerá después de la migración completa
-- ALTER TABLE users ADD CONSTRAINT chk_pin_exists 
--     CHECK (access_pin IS NOT NULL OR access_pin_hash IS NOT NULL);

-- 5. Registrar migración
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('007', 'security_pin_hash', NOW())
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- VERIFICACIÓN POST-MIGRACIÓN
-- ============================================================================
-- Ejecutar después de la migración para verificar:
--
-- SELECT 
--     COUNT(*) FILTER (WHERE access_pin IS NOT NULL AND access_pin_hash IS NULL) as pending_migration,
--     COUNT(*) FILTER (WHERE access_pin_hash IS NOT NULL) as migrated,
--     COUNT(*) as total
-- FROM users;
--
-- ============================================================================

-- ============================================================================
-- ROLLBACK (en caso de problemas)
-- ============================================================================
-- ALTER TABLE users DROP COLUMN IF EXISTS access_pin_hash;
-- ALTER TABLE users DROP COLUMN IF EXISTS last_login_at;
-- ALTER TABLE users DROP COLUMN IF EXISTS last_login_ip;
-- DELETE FROM schema_migrations WHERE version = '007';
-- ============================================================================
