# 🔐 MIGRACIÓN 007: Seguridad de PIN con bcrypt

## Resumen

Esta migración asegura los PINs de usuario reemplazando el almacenamiento en texto plano por hashes bcrypt.

---

## 📋 Pre-requisitos

1. **Backup de la tabla users** (obligatorio)
2. **Acceso a la consola de base de datos** (Neon, pgAdmin, o psql)
3. **Ventana de mantenimiento** (usuarios no podrán loguearse durante la migración)

---

## 🚀 Paso 1: Aplicar Migración SQL

Ejecuta este SQL en tu consola de base de datos (Neon Dashboard → SQL Editor):

```sql
-- ============================================================================
-- MIGRACIÓN 007: Seguridad - Hash de PIN con bcrypt
-- ============================================================================

-- 1. Agregar columna para PIN hasheado
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_pin_hash VARCHAR(60);

-- 2. Agregar columnas de auditoría de login
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(45);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 3. Crear índice para usuarios activos
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active) WHERE is_active = true;

-- 4. Registrar migración
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('007', 'security_pin_hash', NOW())
ON CONFLICT (version) DO NOTHING;

-- 5. Verificar estructura
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('access_pin', 'access_pin_hash', 'last_login_at', 'last_login_ip', 'is_active');
```

**Resultado esperado**: 5 columnas listadas.

---

## 🔑 Paso 2: Migrar PINs a bcrypt

### Opción A: Usando el script (Recomendado)

En tu terminal local con acceso a la base de datos:

```bash
# Configurar variable de entorno
export DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=require"

# Ejecutar migración
cd farmacias-vallenar-suit
npm run migrate:pins
```

### Opción B: SQL Directo (Si no tienes acceso a Node.js)

**⚠️ IMPORTANTE**: bcrypt no está disponible nativamente en PostgreSQL. 
Usa esta alternativa con pgcrypto (menos seguro pero funcional):

```sql
-- Habilitar extensión pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Migrar PINs usando crypt() con bf (blowfish)
UPDATE users 
SET access_pin_hash = crypt(access_pin, gen_salt('bf', 10)),
    access_pin = NULL
WHERE access_pin IS NOT NULL 
AND access_pin_hash IS NULL;

-- Verificar migración
SELECT 
    COUNT(*) FILTER (WHERE access_pin IS NOT NULL) as pending,
    COUNT(*) FILTER (WHERE access_pin_hash IS NOT NULL) as migrated,
    COUNT(*) as total
FROM users;
```

**⚠️ NOTA**: Si usas esta opción, deberás modificar `auth-v2.ts` para usar `pgcrypto` en lugar de `bcryptjs`. El código actual está optimizado para bcrypt de Node.js.

### Opción C: Migración Manual por Usuario

Si prefieres migrar usuario por usuario (útil para pruebas):

```sql
-- Ver usuarios pendientes de migración
SELECT id, name, access_pin FROM users WHERE access_pin IS NOT NULL AND access_pin_hash IS NULL;

-- El hash debe generarse desde Node.js:
-- const bcrypt = require('bcryptjs');
-- const hash = await bcrypt.hash('1234', 10);
-- Resultado ejemplo: $2a$10$N9qo8uLOickgx2ZMRZoMy.MqrqvnB7QJQX.Hq5LU1bBzM8JqF3HGi

-- Actualizar manualmente
UPDATE users SET access_pin_hash = '$2a$10$...hash...', access_pin = NULL WHERE id = 'uuid-del-usuario';
```

---

## ✅ Paso 3: Verificación

### 3.1 Verificar columnas
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name LIKE '%pin%';
```

### 3.2 Verificar migración de datos
```sql
SELECT 
    COUNT(*) FILTER (WHERE access_pin IS NOT NULL AND access_pin_hash IS NULL) as "🔴 Pendientes",
    COUNT(*) FILTER (WHERE access_pin_hash IS NOT NULL) as "🟢 Migrados",
    COUNT(*) FILTER (WHERE access_pin IS NULL AND access_pin_hash IS NULL) as "⚪ Sin PIN",
    COUNT(*) as "Total"
FROM users;
```

**Objetivo**: `Pendientes = 0`, `Migrados = Total de usuarios con PIN`

### 3.3 Probar login
1. Ir a staging: https://farmacias-vallenar-suit-git-staging-miguel-s-projects-1aadc474.vercel.app
2. Intentar login con un usuario migrado
3. Verificar que funciona correctamente

---

## 🔄 Rollback (Si algo falla)

```sql
-- Restaurar PINs desde backup (si tienes)
-- O mantener access_pin hasta confirmar que todo funciona

-- Revertir estructura
ALTER TABLE users DROP COLUMN IF EXISTS access_pin_hash;
ALTER TABLE users DROP COLUMN IF EXISTS last_login_at;
ALTER TABLE users DROP COLUMN IF EXISTS last_login_ip;
DROP INDEX IF EXISTS idx_users_is_active;
DELETE FROM schema_migrations WHERE version = '007';
```

---

## 📊 Estado Post-Migración

Después de completar exitosamente:

| Campo | Estado |
|-------|--------|
| `access_pin` | NULL (eliminado) |
| `access_pin_hash` | Hash bcrypt ($2a$10$...) |
| `is_active` | true (default) |
| `last_login_at` | NULL (se llenará en próximo login) |
| `last_login_ip` | NULL (se llenará en próximo login) |

---

## 🔐 Seguridad

- Los PINs hasheados con bcrypt son **irreversibles**
- Si un usuario olvida su PIN, debe resetearse (no puede recuperarse)
- El hash bcrypt incluye salt automático
- 10 rounds de bcrypt es el estándar actual

---

## 📞 Soporte

Si encuentras problemas:
1. Verificar logs de Vercel
2. Revisar consola de Neon
3. Contactar soporte técnico

---

**Fecha de creación**: 2024-12-23
**Versión**: Pharma-Synapse v3.1
