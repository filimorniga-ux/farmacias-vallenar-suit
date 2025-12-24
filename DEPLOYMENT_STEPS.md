# 🚀 GUÍA DE DEPLOYMENT PASO A PASO
## Pharma-Synapse v3.1 - Producción

**Fecha:** 2024-12-24  
**Tiempo Estimado Total:** 4-6 horas  
**Requisitos Previos:** Acceso a servidor, database backup

---

## FASE 1: PREPARACIÓN LOCAL (15 min)

### 1.1 Generar NEXTAUTH_SECRET

```bash
# En tu máquina local
openssl rand -base64 32
```

**Guardar este valor** - lo necesitarás en paso 2.2

### 1.2 Configurar .env.production

```bash
# Copiar template
cp .env.production.example .env.production

# Editar con valores reales
nano .env.production
```

**Valores REQUERIDOS a configurar:**
- `DATABASE_URL` - Conexión a tu base de datos
- `NEXTAUTH_SECRET` - Valor del paso 1.1
- `NEXTAUTH_URL` - Tu dominio (https://...)
- `BCRYPT_ROUNDS` - Dejar en 10

### 1.3 Verificar Git Status

```bash
# Todo debe estar committed
git status
# Expected: "nothing to commit, working tree clean"

# Verificar branch
git branch
# Expected: * main

# Último commit
git log -1 --oneline
# Expected: 8565a0f docs: add comprehensive test strategy documentation
```

---

## FASE 2: BACKUP DATABASE (30 min)

### 2.1 Backup Completo

**CRÍTICO:** Hacer backup ANTES de cualquier cambio

```bash
# PostgreSQL dump
pg_dump -h <HOST> -U <USER> -d <DATABASE> \
  -Fc -f backup_pre_v3.1_$(date +%Y%m%d_%H%M%S).dump

# Verificar backup
ls -lh backup_*.dump

# Test restore (opcional pero recomendado)
pg_restore --list backup_*.dump | head -20
```

### 2.2 Backup Específico de PINs

```bash
# Conectar a database
psql $DATABASE_URL

# Crear tabla de backup
CREATE TABLE IF NOT EXISTS users_pin_backup AS 
SELECT id, rut, name, access_pin, created_at 
FROM users 
WHERE access_pin IS NOT NULL;

# Verificar
SELECT COUNT(*) FROM users_pin_backup;

\q
```

---

## FASE 3: DEPLOY A STAGING (1-2 horas)

### 3.1 Deploy Código

**Opción A: Vercel**
```bash
# Install Vercel CLI si no lo tienes
npm i -g vercel

# Deploy
vercel --prod

# Configurar env vars en Vercel dashboard:
# https://vercel.com/your-project/settings/environment-variables
```

**Opción B: Railway**
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Deploy
railway up

# Set env vars
railway variables set DATABASE_URL="postgresql://..."
railway variables set NEXTAUTH_SECRET="..."
railway variables set NEXTAUTH_URL="https://..."
```

**Opción C: Docker/VPS Manual**
```bash
# En servidor
git clone https://github.com/filimorniga-ux/farmacias-vallenar-suit
cd farmacias-vallenar-suit
git checkout main

# Copiar .env.production
scp .env.production user@server:/path/to/app/.env.production

# En servidor
npm install
npm run build
npm start
```

### 3.2 Verificar Deployment

```bash
# Check health endpoint
curl https://your-staging-url.com/api/health

# Expected: {"status":"ok","timestamp":"..."}
```

---

## FASE 4: PRE-DEPLOY CHECK EN STAGING (15 min)

### 4.1 Ejecutar Verificación

```bash
# SSH a servidor staging
ssh user@staging-server

# Navegar a app
cd /path/to/app

# Ejecutar check
npx tsx src/scripts/pre-deploy-check.ts
```

**Resultado Esperado:**
```
✅ Build: PASSED
✅ Tests: PASSED
✅ Environment Variables: PASSED
✅ Database Connection: PASSED
✅ Migrations: PASSED
⚠️ PIN Security: NEEDS MIGRATION (esperado)
✅ Audit System: PASSED

Verificaciones pasadas: 6 / 7
```

### 4.2 Si Falla Alguna Verificación

**Environment Variables:**
```bash
# Verificar que existen
printenv | grep -E "(DATABASE_URL|NEXTAUTH_SECRET|NEXTAUTH_URL)"
```

**Database Connection:**
```bash
# Test manual
psql $DATABASE_URL -c "SELECT version();"
```

**Migrations:**
```bash
# Ver migraciones aplicadas
psql $DATABASE_URL -c "SELECT * FROM schema_migrations;"

# Si faltan, aplicar
psql $DATABASE_URL < db/migrations/001_*.sql
# ... etc para todas las migraciones
```

---

## FASE 5: MIGRACIÓN DE PINS (30 min)

### 5.1 Dry Run (OBLIGATORIO)

```bash
# En staging server
npx tsx src/scripts/migrate-pins-to-bcrypt.ts --dry-run
```

**Resultado Esperado:**
```
🔍 DRY RUN MODE - No se realizarán cambios

Usuarios con PINs en plaintext: 15
Plan de migración:
  ✓ Crear tabla backup: users_pin_backup
  ✓ Hashear 15 PINs con bcrypt
  ✓ Actualizar users table
  ✓ Limpiar access_pin (set NULL)

✅ Dry run completado exitosamente
```

### 5.2 Ejecutar Migración Real

```bash
# ATENCIÓN: Este comando modifica la base de datos
npx tsx src/scripts/migrate-pins-to-bcrypt.ts

# Confirmar cuando pregunte
# Expected output:
# ⚠️  ¿Continuar con la migración? (y/N): y
```

**Monitorear Output:**
```
🔄 Migrando PINs a bcrypt...
✅ Tabla backup creada: users_pin_backup
✅ Procesando usuario 1/15: Admin User
✅ Procesando usuario 2/15: Cajero 1
...
✅ 15 usuarios migrados exitosamente
✅ PINs en plaintext limpiados
✅ Migración completada
```

### 5.3 Verificar Migración

```bash
# Conectar a database
psql $DATABASE_URL

-- Todos deben tener hash
SELECT COUNT(*) as users_with_hash 
FROM users 
WHERE access_pin_hash IS NOT NULL;

-- Ninguno debe tener plaintext
SELECT COUNT(*) as users_with_plaintext 
FROM users 
WHERE access_pin IS NOT NULL;

-- Verificar formato bcrypt
SELECT id, LEFT(access_pin_hash, 20) as hash_preview 
FROM users 
LIMIT 5;
-- Expected: $2a$10$...

-- Backup existe
SELECT COUNT(*) FROM users_pin_backup;

\q
```

---

## FASE 6: SMOKE TESTS (1 hora)

### 6.1 Tests E2E Automatizados

```bash
# En tu máquina local, apuntando a staging
BASE_URL=https://your-staging-url.com npm run test:e2e
```

### 6.2 Tests Manuales en UI

**Test 1: Login con PIN Migrado**
1. Ir a https://your-staging-url.com
2. Login con usuario migrado
3. Ingresar PIN original (no cambió)
4. ✅ Debe permitir login

**Test 2: Handover Dual PIN**
1. Abrir sesión caja
2. Hacer ventas
3. Cerrar sesión
4. Iniciar handover
5. Ingresar PIN cashier saliente
6. Ingresar PIN cashier entrante
7. ✅ Debe crear handover + remesa si aplica

**Test 3: Treasury Supervisor PIN**
1. Ir a Finanzas > Treasury
2. Crear transferencia entre cajas
3. Ingresar PIN supervisor
4. ✅ Debe autorizar + crear audit log

**Test 4: Inventory Adjustment**
1. Ir a Inventario
2. Ajuste < 100 units: NO pide PIN
3. Ajuste ≥ 100 units: PIDE supervisor PIN
4. ✅ Debe validar según threshold

**Test 5: Reconciliation**
1. Cerrar sesión con discrepancia
2. Ejecutar reconciliación
3. Ingresar manager PIN
4. Si diff > 50k: requiere admin PIN
5. ✅ Debe crear registro + audit

**Test 6: Customer CRUD**
1. Crear cliente con RUT 12345678-9
2. Agregar loyalty points (transaccional)
3. Export customer data (GDPR)
4. ✅ RUT validado, points transaccionales

**Test 7: WMS Transfer**
1. Transfer < 100 units: NO pide PIN
2. Transfer ≥ 100 units: PIDE supervisor PIN
3. ✅ Debe validar + crear movements

**Test 8: Audit Dashboard**
1. Ir a Settings > Auditoría
2. Filtrar por action_code
3. Export a Excel
4. ✅ Logs completos, filtros funcionan

---

## FASE 7: MONITORING (24 horas)

### 7.1 Queries de Monitoreo

```sql
-- Failed login attempts (última hora)
SELECT COUNT(*), user_id, DATE_TRUNC('hour', created_at) as hour
FROM audit_log
WHERE action_code = 'LOGIN_FAILED'
  AND created_at >= NOW() - INTERVAL '1 hour'
GROUP BY user_id, hour
ORDER BY count DESC;

-- Rate limit triggers (hoy)
SELECT COUNT(*), user_id
FROM audit_log
WHERE action_code = 'LOGIN_BLOCKED_RATE_LIMIT'
  AND DATE(created_at) = CURRENT_DATE
GROUP BY user_id;

-- Reconciliations (últimas 24h)
SELECT COUNT(*), status
FROM cash_register_sessions
WHERE reconciled_at >= NOW() - INTERVAL '24 hours'
GROUP BY status;

-- Stock movements (hoy)
SELECT movement_type, COUNT(*), SUM(ABS(quantity))
FROM stock_movements
WHERE DATE(timestamp) = CURRENT_DATE
GROUP BY movement_type
ORDER BY count DESC;

-- Supervisor PIN usage (hoy)
SELECT COUNT(*), action_code
FROM audit_log
WHERE justification LIKE '%PIN%'
  AND DATE(created_at) = CURRENT_DATE
GROUP BY action_code;
```

### 7.2 Alertas Recomendadas

**Configurar en tu sistema de monitoring:**

```yaml
alerts:
  - name: High Failed Login Rate
    condition: failed_logins > 10 per hour per user
    action: notify_admin
    
  - name: Rate Limit Abuse
    condition: rate_limit_triggers > 5 per day
    action: block_ip + notify_security
    
  - name: Large Reconciliation Discrepancy
    condition: discrepancy > 100000 CLP
    action: notify_manager
    
  - name: Stock Movement Anomaly
    condition: movement > 500 units
    action: notify_supervisor
```

---

## FASE 8: PRODUCCIÓN (Si Staging OK)

### 8.1 Final Checklist

- [ ] Staging funcionando > 24 horas sin issues
- [ ] Smoke tests manuales PASSED
- [ ] E2E tests PASSED
- [ ] No errores en logs
- [ ] Usuarios reportan funcionamiento correcto
- [ ] Database backup producción realizado
- [ ] .env.production con valores correctos

### 8.2 Deploy a Producción

```bash
# Mismo proceso que staging:
# 1. Deploy código
# 2. Pre-deploy check
# 3. Migrar PINs (dry-run + real)
# 4. Smoke tests
# 5. Monitor 24h
```

### 8.3 Comunicación a Usuarios

**Template Email:**
```
Asunto: Actualización Sistema Pharma-Synapse v3.1

Estimado equipo,

El [FECHA] se actualizará el sistema a la versión 3.1 con:

✅ Mayor seguridad (PINs encriptados)
✅ Nuevas features:
   - Dual PIN en handover
   - Supervisor PIN para operaciones grandes
   - Mejor auditoría

❗IMPORTANTE:
- Sus PINs siguen siendo los mismos
- Sistema más seguro automáticamente
- Sin cambios en workflow diario

Horario: [FECHA] [HORA] (estimado 30 min downtime)

Soporte: support@tudominio.com
```

---

## ROLLBACK PLAN

### Si Algo Falla

**1. Rollback Database (PINs):**
```sql
-- Restaurar PINs originales
UPDATE users u
SET access_pin = b.access_pin,
    access_pin_hash = NULL
FROM users_pin_backup b
WHERE u.id = b.id;
```

**2. Rollback Code:**
```bash
# Revertir último deploy
git revert HEAD
git push origin main
# Re-deploy
```

**3. Rollback Database Completo:**
```bash
pg_restore -d <dbname> backup_pre_v3.1_*.dump
```

---

## CONTACTOS DE EMERGENCIA

**Durante Deployment:**
- DevOps: [tu contacto]
- Database Admin: [tu contacto]
- QA Lead: [tu contacto]

**Escalation:**
- CTO/Tech Lead: [tu contacto]

---

## CHECKLIST FINAL

```
PRE-DEPLOYMENT:
[ ] NEXTAUTH_SECRET generado
[ ] .env.production configurado
[ ] Database backup realizado
[ ] Git status clean
[ ] Team notificado

STAGING:
[ ] Código deployed
[ ] Pre-deploy check 6/7 PASSED
[ ] PINs migrados exitosamente
[ ] Smoke tests PASSED
[ ] E2E tests PASSED
[ ] 24h monitoring OK

PRODUCTION:
[ ] Final backup realizado
[ ] Deploy ejecutado
[ ] PINs migrados
[ ] Smoke tests PASSED
[ ] Monitoring activo
[ ] Users notificados
[ ] Post-mortem schedulado (si issues)

POST-DEPLOYMENT:
[ ] Monitor 24h
[ ] Collect user feedback
[ ] Document lessons learned
[ ] Update runbook
```

---

**¡Éxito en el deployment!** 🚀

**Versión:** 1.0  
**Última actualización:** 2024-12-24
