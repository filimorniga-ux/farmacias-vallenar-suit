# 🚀 Guía de Despliegue a Producción - Pharma-Synapse v3.1

**Fecha:** 2024-12-24  
**Versión:** v3.1 Security Audit  
**Responsable:** DevOps/DBA

---

## ⚠️ CHECKLIST PRE-DESPLIEGUE

Antes de ejecutar cualquier paso, verificar:

- [ ] Acceso a servidor de producción
- [ ] Permisos de DBA/Superuser
- [ ] Ventana de mantenimiento coordinada
- [ ] Equipo de soporte alertado
- [ ] Plan de rollback preparado

---

## 1️⃣ BACKUP PREVENTIVO (CRÍTICO)

### Opción A: Backup Completo con pg_dump

```bash
# Conectarse al servidor de producción
ssh user@production-server

# Variables de entorno
export DATABASE_URL="postgresql://user:pass@host:port/dbname"
export BACKUP_DIR="/backups/pharma-synapse"
export BACKUP_DATE=$(date +%Y%m%d_%H%M%S)

# Crear directorio de backups
mkdir -p $BACKUP_DIR

# Backup completo (incluye schema + data)
pg_dump $DATABASE_URL \
  --format=custom \
  --compress=9 \
  --file="$BACKUP_DIR/pharma_pre_pin_migration_$BACKUP_DATE.dump" \
  --verbose

# Verificar tamaño del backup
ls -lh $BACKUP_DIR/pharma_pre_pin_migration_$BACKUP_DATE.dump

# Verificar integridad
pg_restore --list "$BACKUP_DIR/pharma_pre_pin_migration_$BACKUP_DATE.dump" | head -20
```

**Tiempo estimado:** 5-15 minutos (depende del tamaño de DB)

### Opción B: Snapshot de TimescaleDB (si aplica)

Si usas Timescale Cloud, crear snapshot desde dashboard:

1. Ir a https://console.cloud.timescale.com
2. Seleccionar servicio de producción
3. **Operations → Backups → Create Snapshot**
4. Nombre: `pre-pin-migration-2024-12-24`
5. Esperar confirmación

---

## 2️⃣ VERIFICACIÓN DE VARIABLES DE ENTORNO

### Verificar en Servidor de Producción

```bash
# Conectarse al servidor
ssh user@production-server

# Ubicación típica de .env (ajustar según tu setup)
cd /var/www/pharma-synapse  # o donde esté desplegado

# Verificar que .env.production existe
ls -la .env.production

# Revisar variables críticas (SIN mostrar valores sensibles)
echo "Verificando variables de entorno..."

# DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL no configurada"
  exit 1
else
  echo "✅ DATABASE_URL configurada"
fi

# BCRYPT_ROUNDS (10 es estándar, 12 es más seguro pero más lento)
if [ -z "$BCRYPT_ROUNDS" ]; then
  echo "⚠️ BCRYPT_ROUNDS no configurada, usando default (10)"
  export BCRYPT_ROUNDS=10
else
  echo "✅ BCRYPT_ROUNDS=$BCRYPT_ROUNDS"
fi

# NEXTAUTH_SECRET
if [ -z "$NEXTAUTH_SECRET" ]; then
  echo "❌ NEXTAUTH_SECRET no configurada"
  exit 1
else
  echo "✅ NEXTAUTH_SECRET configurada"
fi

echo "✅ Variables de entorno verificadas"
```

### Configurar si faltan

Si `BCRYPT_ROUNDS` no está configurada, agregarla:

```bash
# Editar .env.production
nano .env.production

# Agregar línea:
BCRYPT_ROUNDS=10

# Guardar (Ctrl+O, Enter, Ctrl+X)

# Recargar variables
source .env.production
```

---

## 3️⃣ EJECUTAR PRE-DEPLOY CHECK

Antes de migrar PINs, verificar que el sistema esté listo:

```bash
cd /var/www/pharma-synapse

# Ejecutar script de verificación
npx tsx src/scripts/pre-deploy-check.ts
```

**Resultado esperado:**

```
============================================================
  🚀 PRE-DEPLOY VERIFICATION - Pharma-Synapse v3.1
============================================================

  ✅ Build: PASSED
  ✅ Tests: PASSED
  ✅ Environment Variables: PASSED
  ✅ Database Connection: PASSED
  ✅ Migrations: PASSED
  ✅ PIN Security: FAILED (PINs en texto plano detectados)
  ✅ Audit System: PASSED

Verificaciones pasadas: 6 / 7
```

⚠️ Es **NORMAL** que "PIN Security" falle antes de migración.

---

## 4️⃣ MIGRACIÓN DE PINS A BCRYPT

### Verificar Estado Actual

Primero, verificar cuántos usuarios tienen PINs en texto plano:

```sql
-- Conectarse a la base de datos
psql $DATABASE_URL

-- Consulta de estado
SELECT 
    COUNT(*) FILTER (WHERE access_pin IS NOT NULL AND access_pin_hash IS NULL) as plaintext_count,
    COUNT(*) FILTER (WHERE access_pin_hash IS NOT NULL) as hashed_count,
    COUNT(*) as total_users
FROM users
WHERE is_active = true;
```

**Ejemplo de output:**
```
 plaintext_count | hashed_count | total_users 
-----------------+--------------+-------------
              23 |            0 |          23
```

### Ejecutar Migración

```bash
# Ejecutar script de migración
npx tsx src/scripts/migrate-pins-to-bcrypt.ts
```

**Output esperado:**

```
🔐 Iniciando migración de PINs a bcrypt...

📊 Estado inicial:
   - Usuarios activos: 23
   - Con PIN texto plano: 23
   - Con PIN bcrypt: 0

⏳ Migrando PINs...
   ✅ Usuario ID: abc123 migrado (CASHIER)
   ✅ Usuario ID: def456 migrado (MANAGER)
   ✅ Usuario ID: ghi789 migrado (ADMIN)
   ...

✅ Migración completada!

📊 Estado final:
   - Usuarios migrados: 23
   - Con PIN bcrypt: 23
   - Errores: 0

🎉 Todos los PINs han sido migrados exitosamente a bcrypt
```

### Verificar Post-Migración

```sql
-- Reconectarse a la base de datos si es necesario
psql $DATABASE_URL

-- Verificar que todos los PINs estén hasheados
SELECT 
    COUNT(*) FILTER (WHERE access_pin IS NOT NULL AND access_pin_hash IS NULL) as plaintext_count,
    COUNT(*) FILTER (WHERE access_pin_hash IS NOT NULL) as hashed_count,
    COUNT(*) as total_users
FROM users
WHERE is_active = true;
```

**Resultado esperado:**
```
 plaintext_count | hashed_count | total_users 
-----------------+--------------+-------------
               0 |           23 |          23
```

✅ `plaintext_count` debe ser **0**

---

## 5️⃣ VERIFICACIÓN POST-MIGRACIÓN

### Re-ejecutar Pre-Deploy Check

```bash
npx tsx src/scripts/pre-deploy-check.ts
```

**Ahora TODAS las verificaciones deben pasar:**

```
============================================================
  RESUMEN DE VERIFICACIÓN
============================================================

  ✅ Build: PASSED
  ✅ Tests: PASSED
  ✅ Environment Variables: PASSED
  ✅ Database Connection: PASSED
  ✅ Migrations: PASSED
  ✅ PIN Security: PASSED ✨ (FIXED!)
  ✅ Audit System: PASSED

────────────────────────────────────────────────────
Verificaciones pasadas: 7 / 7
Verificaciones fallidas: 0 / 7
────────────────────────────────────────────────────

  ✅ 🎉 SISTEMA LISTO PARA DEPLOY A PRODUCCIÓN
```

### Test de Login Manual

**CRÍTICO:** Probar login con usuarios de prueba antes de abrir al público:

1. Abrir aplicación en staging/producción
2. Intentar login con usuario CASHIER conocido
3. Intentar login con usuario MANAGER conocido
4. Intentar login con usuario ADMIN conocido

Si algún login falla, verificar logs:

```bash
# Ver logs de aplicación
pm2 logs pharma-synapse --lines 100

# O si usas docker
docker logs pharma-synapse-container --tail 100
```

---

## 6️⃣ MONITOREO POST-DEPLOY (Primeras 24h)

### Verificar Audit Logs

```sql
-- Ver intentos de login recientes
SELECT 
    created_at,
    user_id,
    action_code,
    new_values->>'success' as login_success
FROM audit_log
WHERE action_code IN ('USER_LOGIN', 'LOGIN_FAILED')
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 20;
```

### Alertas a Configurar

Monitorear en las primeras 24 horas:

- ⚠️ Picos de `LOGIN_FAILED` (puede indicar PINs incorrectos)
- ⚠️ Errores de bcrypt en logs
- ⚠️ Rate limiting activándose (normal, pero monitorear)
- ✅ `USER_LOGIN` exitosos (confirma que migración funciona)

---

## 7️⃣ PLAN DE ROLLBACK (Si algo sale mal)

### Si la migración falla a mitad de camino:

```bash
# Restaurar backup
export BACKUP_FILE="/backups/pharma-synapse/pharma_pre_pin_migration_20241224_100000.dump"

# Detener aplicación
pm2 stop pharma-synapse

# Restaurar base de datos
pg_restore --clean --if-exists --dbname=$DATABASE_URL $BACKUP_FILE

# Reiniciar aplicación
pm2 start pharma-synapse

# Verificar logs
pm2 logs pharma-synapse
```

### Si los usuarios no pueden hacer login después de migración:

1. **NO hacer rollback todavía**
2. Verificar logs: `pm2 logs | grep "PIN"`
3. Verificar que `access_pin_hash` esté poblado en DB
4. Verificar que `BCRYPT_ROUNDS` esté configurado
5. Si persiste, restaurar backup

---

## 8️⃣ COMANDOS RÁPIDOS DE DIAGNÓSTICO

```bash
# Ver usuarios con problemas de PIN
psql $DATABASE_URL -c "
SELECT id, email, role, 
       CASE WHEN access_pin_hash IS NOT NULL THEN 'bcrypt' ELSE 'plaintext' END as pin_type
FROM users 
WHERE is_active = true 
ORDER BY role;
"

# Ver últimos 10 intentos de login
psql $DATABASE_URL -c "
SELECT created_at::timestamp(0), user_id, action_code, 
       new_values->>'email' as email
FROM audit_log 
WHERE action_code IN ('USER_LOGIN', 'LOGIN_FAILED')
ORDER BY created_at DESC 
LIMIT 10;
"

# Ver estado de rate limiting (requiere access a app logs)
pm2 logs pharma-synapse | grep "Rate Limit"
```

---

## 9️⃣ CHECKLIST POST-DEPLOY

- [ ] Backup realizado y verificado
- [ ] Variables de entorno configuradas
- [ ] Script de migración ejecutado exitosamente
- [ ] Pre-deploy check 7/7 ✅
- [ ] Test de login manual exitoso (3 roles)
- [ ] Audit logs mostrando logins exitosos
- [ ] Sin errores en logs de aplicación
- [ ] Equipo de soporte notificado
- [ ] Documentación actualizada
- [ ] Plan de rollback documentado

---

## 🆘 CONTACTOS DE EMERGENCIA

| Rol | Responsabilidad | Contacto |
|-----|-----------------|----------|
| DBA | Base de datos, backups | [TBD] |
| DevOps | Servidor, deploy | [TBD] |
| Dev Lead | Código, troubleshooting | [TBD] |
| Product Owner | Decisión de rollback | [TBD] |

---

## 📝 NOTAS ADICIONALES

**Tiempo estimado total:** 30-60 minutos  
**Ventana de mantenimiento sugerida:** Fuera de horario comercial  
**Usuarios afectados:** Todos (pero login debe seguir funcionando)  
**Reversible:** Sí (con backup)

**Última actualización:** 2024-12-24 10:40 CLT
