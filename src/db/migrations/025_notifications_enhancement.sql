-- ============================================================================
-- Migration 025: Notifications Enhancement
-- Farmacias Vallenar Suit — Notification Center Refactor
-- Fixes: type/severity constraints, adds action_url, dedup_key
-- ============================================================================

-- 1. Ampliar tipos permitidos (STOCK_CRITICAL y GENERAL se emitían desde el código
--    pero violaban el CHECK constraint → inserción fallaba silenciosamente)
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'HR', 'INVENTORY', 'CASH', 'WMS', 'SYSTEM',
      'CONFIG', 'STOCK_CRITICAL', 'GENERAL', 'PROCUREMENT', 'TRANSFER'
    ));

-- 2. Ampliar severidades (CRITICAL se emitía desde código pero también violaba el CHECK)
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_severity_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_severity_check
    CHECK (severity IN ('INFO', 'SUCCESS', 'WARNING', 'ERROR', 'CRITICAL'));

-- 3. Agregar action_url: URL de destino al hacer click en la notificación
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS action_url TEXT;

-- 4. Agregar dedup_key: clave única para evitar notificaciones duplicadas
--    Ejemplo: 'stock_critical_analysis_<locationId>_<date>' → se puede hacer UPSERT
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS dedup_key TEXT;

-- 5. Índice único para deduplicación (solo cuando dedup_key no es NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedup
  ON notifications(dedup_key)
  WHERE dedup_key IS NOT NULL;

-- 6. Columna para guardar push token del dispositivo nativo (Android/iOS)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS push_token TEXT;

-- 7. Índice para buscar rápidamente tokens de usuarios de una ubicación
CREATE INDEX IF NOT EXISTS idx_users_push_token
  ON users(push_token)
  WHERE push_token IS NOT NULL AND is_active = true;

-- 8. Comentarios de documentación
COMMENT ON COLUMN notifications.action_url IS 'URL del módulo al que navegar al hacer click (ej: /wms, /logistica)';
COMMENT ON COLUMN notifications.dedup_key IS 'Clave única para evitar notificaciones duplicadas del mismo evento';
COMMENT ON COLUMN users.push_token IS 'Token FCM/APNs para notificaciones push en dispositivos móviles';
