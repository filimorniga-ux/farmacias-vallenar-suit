# 🚀 DEPLOYMENT VERCEL + TIMESCALE - GUÍA RÁPIDA

## ✅ Estado Actual Verificado

**Database:** Timescale Cloud (PostgreSQL 17.7)
- ✅ Todas las tablas existen (49 tablas)
- ✅ Columna `users.access_pin_hash` existe
- ✅ 16 usuarios con PINs hasheados
- ✅ **Migración de PINs YA COMPLETADA**
- ✅ Tabla `audit_log` existe

**Código:**
- ✅ 9/9 módulos v2 implementados
- ✅ Build passing
- ✅ Tests: 236+ passing
- ✅ Commits pusheados a main

---

## PASO 1: Deploy a Vercel (5 minutos)

### 1.1 Install Vercel CLI (si no lo tienes)

```bash
npm i -g vercel
```

### 1.2 Login a Vercel

```bash
vercel login
```

### 1.3 Conectar Proyecto

```bash
# En el directorio del proyecto
cd /Users/miguelperdomoserrato/farmacias-vallenar-suit

# Link proyecto (primera vez)
vercel link

# Responder:
# - Set up and deploy? Y
# - Scope: [tu equipo/cuenta]
# - Link to existing project? N (crear nuevo)
# - Project name: farmacias-vallenar-suit
# - Directory: ./
# - Override settings? N
```

### 1.4 Configurar Environment Variables

**Opción A: Via CLI (más rápido)**

```bash
# Database
vercel env add DATABASE_URL production
# Pegar: postgres://tsdbadmin@otzu2xb7ra.m1xugm0lj9.tsdb.cloud.timescale.com:31684/tsdb?sslmode=require
# Enter

# NextAuth Secret (generado anteriormente)
vercel env add NEXTAUTH_SECRET production
# Pegar: VIzhEtgWQ9kWD04xc5wh6u5BtaeABWOOz+wXsaLFONs=
# Enter

# bcrypt rounds
vercel env add BCRYPT_ROUNDS production
# Escribir: 10
# Enter
```

**Opción B: Via Dashboard**

1. Ir a https://vercel.com/dashboard
2. Seleccionar proyecto `farmacias-vallenar-suit`
3. Settings > Environment Variables
4. Agregar:
   - `DATABASE_URL`: `postgres://tsdbadmin@otzu2xb7ra.m1xugm0lj9.tsdb.cloud.timescale.com:31684/tsdb?sslmode=require`
   - `NEXTAUTH_SECRET`: `VIzhEtgWQ9kWD04xc5wh6u5BtaeABWOOz+wXsaLFONs=`
   - `BCRYPT_ROUNDS`: `10`

### 1.5 Deploy a Preview (Staging)

```bash
# Deploy a preview URL primero
vercel

# Output esperado:
# Vercel CLI 28.x.x
# 🔍  Inspect: https://vercel.com/...
# ✅  Preview: https://farmacias-vallenar-suit-xxxxx.vercel.app
```

**Guardar la URL de Preview** - la usarás para smoke tests.

---

## PASO 2: Smoke Tests en Preview (15 minutos)

### 2.1 Tests Automáticos

```bash
# En tu máquina local
BASE_URL=https://farmacias-vallenar-suit-xxxxx.vercel.app npm run test:e2e
```

### 2.2 Tests Manuales

**Abrir:** https://farmacias-vallenar-suit-xxxxx.vercel.app

**Test 1: Login** ✅
- Ingresar con usuario existente
- PIN debe funcionar (ya hasheado)

**Test 2: Crear Venta** ✅
- Abrir sesión caja
- Registrar venta
- Verificar en reports

**Test 3: Handover** ✅
- Dual PIN funciona
- Remesa se crea si hay surplus

**Test 4: Audit Log** ✅
- Settings > Auditoría
- Ver logs de login, ventas, etc.

**Test 5: Treasury** ✅
- Transferencia con supervisor PIN
- Verificar audit trail

---

## PASO 3: Deploy a Producción (Si Preview OK)

### 3.1 Configurar NEXTAUTH_URL para Producción

```bash
# Agregar URL de producción
vercel env add NEXTAUTH_URL production
# Escribir: https://tu-dominio.com
# O si usas dominio Vercel: https://farmacias-vallenar-suit.vercel.app
```

### 3.2 Deploy a Producción

```bash
vercel --prod

# Output esperado:
# ✅  Production: https://farmacias-vallenar-suit.vercel.app
```

### 3.3 Configurar Dominio Custom (Opcional)

```bash
# Agregar dominio
vercel domains add tudominio.com

# Actualizar DNS según instrucciones Vercel
# Esperar propagación (~5-10 min)

# Actualizar NEXTAUTH_URL
vercel env rm NEXTAUTH_URL production
vercel env add NEXTAUTH_URL production
# Escribir: https://tudominio.com
```

---

## PASO 4: Monitoring Post-Deploy (24 horas)

### 4.1 Vercel Analytics

Dashboard automático en: https://vercel.com/dashboard/analytics

**Métricas a monitorear:**
- Response time < 500ms
- Error rate < 1%
- 99% uptime

### 4.2 Database Monitoring

```bash
# Queries de monitoreo (ejecutar varias veces durante el día)

# Failed logins
psql $DATABASE_URL -c "
SELECT COUNT(*), user_id 
FROM audit_log 
WHERE action_code = 'LOGIN_FAILED' 
  AND created_at >= NOW() - INTERVAL '1 hour' 
GROUP BY user_id;"

# Sessions today
psql $DATABASE_URL -c "
SELECT COUNT(*), status 
FROM cash_register_sessions 
WHERE DATE(created_at) = CURRENT_DATE 
GROUP BY status;"

# Stock movements
psql $DATABASE_URL -c "
SELECT movement_type, COUNT(*) 
FROM stock_movements 
WHERE DATE(timestamp) = CURRENT_DATE 
GROUP BY movement_type;"
```

### 4.3 Vercel Logs

```bash
# Ver logs en tiempo real
vercel logs --follow

# Ver errores
vercel logs --errors
```

---

## PASO 5: Optimizaciones Post-Deploy (Opcional)

### 5.1 Database Connection Pooling

Vercel tiene límites de conexiones. Configurar pooling:

```typescript
// En src/lib/db.ts (ya configurado)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20, // Max connections
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});
```

### 5.2 Caching con Vercel KV (Opcional)

```bash
# Instalar Vercel KV
vercel integration add kv

# Usar para rate limiting cache
```

### 5.3 Edge Functions (Opcional)

Configurar edge para mejor latencia en ciertas rutas.

---

## CHECKLIST COMPLETO

### Pre-Deploy
- [x] Database verificada (Timescale Cloud)
- [x] PINs migrados (16 hashed)
- [x] Código en main
- [x] Build passing

### Deploy Setup
- [ ] Vercel CLI instalado
- [ ] Proyecto linked
- [ ] Env vars configuradas (DATABASE_URL, NEXTAUTH_SECRET, BCRYPT_ROUNDS)

### Preview Deploy
- [ ] Deploy a preview ejecutado
- [ ] Preview URL obtenida
- [ ] Smoke tests manuales PASSED
- [ ] E2E tests PASSED (opcional)

### Production Deploy
- [ ] NEXTAUTH_URL configurado
- [ ] Deploy --prod ejecutado
- [ ] Dominio custom configurado (opcional)
- [ ] Production URL funcionando

### Post-Deploy
- [ ] Smoke tests en producción PASSED
- [ ] Vercel Analytics activo
- [ ] Database monitoring configurado
- [ ] 24h monitoring sin issues

---

## ⚡ COMANDO RÁPIDO (Todo en uno)

```bash
# Setup completo en un solo comando
vercel link && \
vercel env add DATABASE_URL production && \
vercel env add NEXTAUTH_SECRET production && \
vercel env add BCRYPT_ROUNDS production && \
vercel && \
echo "Preview deployed! Test at the URL above, then run: vercel --prod"
```

---

## 🆘 Troubleshooting

### Error: "DATABASE_URL not found"
```bash
# Verificar env vars
vercel env ls

# Agregar si falta
vercel env add DATABASE_URL production
```

### Error: "Build failed"
```bash
# Ver logs
vercel logs

# Re-deploy
vercel --force
```

### Error: "Too many database connections"
```bash
# Reducir max connections en pool
# Editar src/lib/db.ts:
max: 10  // Reducir de 20 a 10
```

### Error: "NextAuth session not working"
```bash
# Verificar NEXTAUTH_URL coincide con dominio
vercel env ls
# Debe ser: https://tu-dominio-real.com

# Actualizar si necesario
vercel env rm NEXTAUTH_URL production
vercel env add NEXTAUTH_URL production
```

---

## 📊 Resultado Esperado

✅ **Preview URL:** https://farmacias-vallenar-suit-xxxxx.vercel.app  
✅ **Production URL:** https://farmacias-vallenar-suit.vercel.app  
✅ **Build Time:** ~2-3 minutos  
✅ **Cold Start:** <1 segundo  
✅ **Response Time:** <500ms  

---

**¡Deployment Completado!** 🎉

**Siguientes comandos:**
```bash
# 1. Setup
vercel link

# 2. Configure env vars
vercel env add DATABASE_URL production
vercel env add NEXTAUTH_SECRET production
vercel env add BCRYPT_ROUNDS production

# 3. Deploy preview
vercel

# 4. Test preview, then deploy production
vercel --prod
```
