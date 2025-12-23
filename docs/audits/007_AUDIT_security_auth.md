# AUDITORÍA #007: Módulos de Seguridad y Autenticación
## Pharma-Synapse v3.1 - Análisis de Control de Acceso

**Fecha**: 2024-12-23
**Archivos Auditados**:
- `src/actions/security.ts` (248 líneas)
- `src/actions/auth.ts` (74 líneas)

**Criticidad**: 🔴 CRÍTICA (Control de acceso y autenticación)

---

## 1. RESUMEN EJECUTIVO

Los módulos de seguridad y autenticación implementan rate limiting, gestión de sesiones y autenticación por PIN. Se identificaron **3 problemas CRÍTICOS**, **4 MEDIOS** y **2 BAJOS**.

### Evaluación General

| Aspecto | Estado | Notas |
|---------|--------|-------|
| Rate Limiting | 🟢 BIEN | Implementado con DB |
| Auditoría de Login | 🟢 BIEN | Registra intentos |
| Gestión de Sesiones | 🟢 BIEN | Token versioning |
| Hashing de PIN | 🔴 CRÍTICO | **PIN en texto plano** |
| SQL Injection | 🟡 MEDIO | Interpolación en query |
| Validación | 🔴 CRÍTICO | Sin validación de inputs |

---

## 2. HALLAZGOS POSITIVOS ✅

### 2.1 Rate Limiting Implementado

```typescript
// security.ts:12-49
export async function checkRateLimit(identifier: string) {
    // Configuración dinámica desde app_settings
    const MAX_ATTEMPTS = parseInt(settingsMap.get('SECURITY_MAX_LOGIN_ATTEMPTS') || '5');
    const BLOCK_DURATION_MINUTES = parseInt(settingsMap.get('SECURITY_LOCKOUT_DURATION_MINUTES') || '15');
    
    // Verificación de bloqueo activo
    if (row.blocked_until && new Date(row.blocked_until) > now) {
        return { allowed: false, error: `Demasiados intentos. Espere ${waitParams} minutos.` };
    }
}
```

**Fortalezas**:
- Configurable desde BD
- Reset automático después de ventana de tiempo
- Bloqueo temporal efectivo

### 2.2 Auditoría de Eventos de Login

```typescript
// auth.ts:18, 31, 46, 62
await logAuditAction(userId, 'LOGIN_BLOCKED', { reason: 'Rate Limit Exceeded' });
await logAuditAction(userId, 'LOGIN_FAILED', { attempts: 'incremented' });
await logAuditAction(userId, 'LOGIN_BLOCKED_LOCATION', {...});
await logAuditAction(user.id, 'LOGIN_SUCCESS', { role: user.role, location: locationId });
```

### 2.3 Token Versioning para Revocación de Sesiones

```typescript
// security.ts:194-208
export async function revokeSession(targetUserId: string, adminUserId: string) {
    // Incrementar token_version invalida todos los tokens cliente
    await query('UPDATE users SET token_version = COALESCE(token_version, 1) + 1 WHERE id = $1', [targetUserId]);
    await logAuditAction(adminUserId, 'SESSION_REVOKED', { target_user: targetUserId });
}
```

### 2.4 Autorización por Ubicación

```typescript
// auth.ts:39-49
if (!isGlobalAdmin && user.assigned_location_id && user.assigned_location_id !== locationId) {
    return { success: false, error: 'No tienes contrato en esta sucursal.' };
}
```

---

## 3. HALLAZGOS CRÍTICOS

### 3.1 CRÍTICO: PIN Almacenado y Comparado en Texto Plano

**Archivo**: `auth.ts:26`

```typescript
const res = await query(
    'SELECT * FROM users WHERE id = $1 AND access_pin = $2', 
    [userId, pin]  // ❌ PIN comparado en texto plano
);
```

**Riesgo GRAVE**:
- Si la BD es comprometida, todos los PINs están expuestos
- No hay protección contra ataques de fuerza bruta a nivel de hash
- Incumplimiento de estándares de seguridad (PCI-DSS, etc.)

**Corrección**:
```typescript
import bcrypt from 'bcryptjs';

export async function authenticateUser(
    userId: string, 
    pin: string, 
    locationId?: string
): Promise<AuthResult> {
    // 1. Rate Limiting
    const limitCheck = await checkRateLimit(userId);
    if (!limitCheck.allowed) return { success: false, error: limitCheck.error };
    
    // 2. Obtener usuario SIN comparar PIN en query
    const res = await query('SELECT * FROM users WHERE id = $1', [userId]);
    
    if (res.rowCount === 0) {
        await incrementRateLimit(userId);
        await logAuditAction(userId, 'LOGIN_FAILED', { reason: 'USER_NOT_FOUND' });
        // Mensaje genérico para no revelar existencia del usuario
        return { success: false, error: 'Credenciales inválidas' };
    }
    
    const user = res.rows[0];
    
    // 3. Comparar PIN hasheado
    const pinValid = await bcrypt.compare(pin, user.access_pin_hash);
    
    if (!pinValid) {
        await incrementRateLimit(userId);
        await logAuditAction(userId, 'LOGIN_FAILED', { reason: 'INVALID_PIN' });
        return { success: false, error: 'Credenciales inválidas' };
    }
    
    // 4. Resto de la lógica...
}

// Función para hashear PIN al crear/actualizar usuario
export async function setUserPin(userId: string, newPin: string): Promise<boolean> {
    const saltRounds = 10;
    const hashedPin = await bcrypt.hash(newPin, saltRounds);
    
    await query(
        'UPDATE users SET access_pin_hash = $1 WHERE id = $2',
        [hashedPin, userId]
    );
    
    return true;
}
```

**Migración necesaria**:
```sql
-- Migración: Hashear PINs existentes
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_pin_hash VARCHAR(60);

-- Script de migración (ejecutar en mantenimiento)
-- Requiere bcrypt en PL/pgSQL o migración desde aplicación
```

---

### 3.2 CRÍTICO: SQL Injection en incrementRateLimit

**Archivo**: `security.ts:69-73`

```typescript
await query(`
    UPDATE login_attempts 
    SET blocked_until = NOW() + INTERVAL '${BLOCK_DURATION_MINUTES} minutes'
    WHERE identifier = $1
`, [identifier]);
```

**Vulnerabilidad**: `BLOCK_DURATION_MINUTES` viene de la BD y se interpola directamente en el SQL.

**Escenario de ataque**:
1. Atacante modifica `app_settings.value` para `SECURITY_LOCKOUT_DURATION_MINUTES`
2. Valor malicioso: `1 minutes'; DROP TABLE users; --`
3. Query resultante destruye datos

**Corrección**:
```typescript
// Usar parámetros seguros
await query(`
    UPDATE login_attempts 
    SET blocked_until = NOW() + ($2 || ' minutes')::INTERVAL
    WHERE identifier = $1
`, [identifier, BLOCK_DURATION_MINUTES.toString()]);

// O mejor aún, validar el valor
const validatedDuration = Math.min(Math.max(parseInt(BLOCK_DURATION_MINUTES) || 15, 1), 1440);
await query(`
    UPDATE login_attempts 
    SET blocked_until = NOW() + make_interval(mins := $2)
    WHERE identifier = $1
`, [identifier, validatedDuration]);
```

---

### 3.3 CRÍTICO: Sin Validación de Inputs

**Archivo**: `auth.ts:10` y `security.ts` múltiples funciones

```typescript
export async function authenticateUser(
    userId: string,    // ❌ No validado como UUID
    pin: string,       // ❌ No validado formato
    locationId?: string // ❌ No validado como UUID
): Promise<...> {
```

**Riesgo**:
- Parámetros malformados pueden causar errores
- Sin sanitización de inputs

**Corrección con Zod**:
```typescript
import { z } from 'zod';

const AuthSchema = z.object({
    userId: z.string().uuid('ID de usuario inválido'),
    pin: z.string()
        .min(4, 'PIN debe tener al menos 4 dígitos')
        .max(8, 'PIN no puede exceder 8 dígitos')
        .regex(/^\d+$/, 'PIN debe contener solo números'),
    locationId: z.string().uuid().optional()
});

export async function authenticateUser(
    userId: string, 
    pin: string, 
    locationId?: string
): Promise<AuthResult> {
    const validated = AuthSchema.safeParse({ userId, pin, locationId });
    if (!validated.success) {
        return { success: false, error: 'Datos de autenticación inválidos' };
    }
    // ... resto de lógica
}
```

---

## 4. HALLAZGOS MEDIOS

### 4.1 MEDIO: logAuditAction No Es Transaccional

**Archivo**: `security.ts:88-101`

```typescript
export async function logAuditAction(userId: string | null, action: string, details: any) {
    try {
        // ❌ Puede fallar silenciosamente
        await query(`
            INSERT INTO audit_logs (user_id, action, details, ip_address)
            VALUES ($1, $2, $3, $4)
        `, [userId, action, sanitizedDetails, ip]);
    } catch (error) {
        console.error('Audit Log Failed:', error);  // ❌ Solo log, no falla
    }
}
```

**Problema**: Si el audit log falla, la operación principal continúa sin registro.

**Para operaciones críticas**, el audit debe ser obligatorio.

---

### 4.2 MEDIO: verifySession Sin Verificación de Permisos Admin

**Archivo**: `security.ts:194-208`

```typescript
export async function revokeSession(targetUserId: string, adminUserId: string) {
    // ❌ NO VERIFICA:
    // - ¿adminUserId realmente es admin?
    // - ¿Tiene permiso para revocar sesiones?
    
    await query('UPDATE users SET token_version = ... WHERE id = $1', [targetUserId]);
    await logAuditAction(adminUserId, 'SESSION_REVOKED', {...});
}
```

**Corrección**:
```typescript
export async function revokeSession(
    targetUserId: string, 
    adminUserId: string
): Promise<{ success: boolean; error?: string }> {
    // Verificar permisos del admin
    const adminCheck = await query('SELECT role FROM users WHERE id = $1', [adminUserId]);
    
    if (adminCheck.rowCount === 0) {
        return { success: false, error: 'Admin no encontrado' };
    }
    
    const adminRole = adminCheck.rows[0].role;
    if (!['ADMIN', 'MANAGER', 'GERENTE_GENERAL'].includes(adminRole)) {
        await logAuditAction(adminUserId, 'REVOKE_DENIED', { target: targetUserId });
        return { success: false, error: 'Sin permisos para revocar sesiones' };
    }
    
    // Proceder con revocación...
}
```

---

### 4.3 MEDIO: SQL Injection en getAuditLogs

**Archivo**: `security.ts:133`

```typescript
queryStr += ` ORDER BY al.timestamp DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`;
```

**Problema**: `limit` y `page` se interpolan directamente.

**Corrección**:
```typescript
// Validar y parametrizar
const validLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
const validPage = Math.max(Number(page) || 1, 1);
const offset = (validPage - 1) * validLimit;

queryStr += ` ORDER BY al.timestamp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
params.push(validLimit, offset);
```

---

### 4.4 MEDIO: Timeout de Sesión Solo por Actividad

**Archivo**: `security.ts:218-223`

```typescript
const res = await query(`
    SELECT ...
    FROM users 
    WHERE last_active_at > NOW() - INTERVAL '24 hours'
`);
```

No hay mecanismo de timeout absoluto de sesión. Un usuario que mantiene actividad puede tener sesión indefinida.

**Recomendación**: Agregar `session_created_at` y timeout absoluto (ej: 12 horas).

---

## 5. HALLAZGOS BAJOS

### 5.1 BAJO: Diferentes Tablas de Audit Log

```typescript
// security.ts:94 usa:
INSERT INTO audit_logs (user_id, action, details, ip_address)

// Pero migración 005 define:
INSERT INTO audit_log (id, user_id, session_id, action_code, ...)
```

**Inconsistencia**: Hay dos tablas de auditoría (`audit_logs` vs `audit_log`).

---

### 5.2 BAJO: IP Address Parsing Inseguro

**Archivo**: `security.ts:91`

```typescript
let ip = headerStore.get('x-forwarded-for') || headerStore.get('x-real-ip') || 'unknown';
```

`x-forwarded-for` puede contener múltiples IPs separadas por coma. Debería parsearse correctamente:

```typescript
const xForwardedFor = headerStore.get('x-forwarded-for');
let ip = 'unknown';
if (xForwardedFor) {
    // Tomar primera IP (más cercana al cliente)
    ip = xForwardedFor.split(',')[0].trim();
} else {
    ip = headerStore.get('x-real-ip') || 'unknown';
}
```

---

## 6. MATRIZ DE SEGURIDAD OWASP

| Categoría OWASP | Estado | Detalle |
|-----------------|--------|---------|
| A01 Broken Access Control | 🟡 Parcial | Falta verificación de admin en revokeSession |
| A02 Cryptographic Failures | 🔴 Crítico | PIN en texto plano |
| A03 Injection | 🟡 Medio | SQL injection en INTERVAL y LIMIT |
| A04 Insecure Design | 🟢 OK | Rate limiting implementado |
| A05 Security Misconfiguration | 🟢 OK | Configuración en DB |
| A06 Vulnerable Components | N/A | - |
| A07 Auth Failures | 🟡 Parcial | PIN plano, falta MFA |
| A08 Data Integrity Failures | 🟢 OK | Token versioning |
| A09 Logging Failures | 🟡 Parcial | Logs pueden fallar silenciosamente |
| A10 SSRF | N/A | - |

---

## 7. RECOMENDACIONES DE CORRECCIÓN

### Prioridad CRÍTICA (Inmediata)
1. **Hashear PINs con bcrypt** - Migración urgente
2. **Corregir SQL injection** en INTERVAL
3. **Agregar validación Zod** a todas las funciones

### Prioridad ALTA (Esta semana)
4. Verificar permisos en `revokeSession`
5. Parametrizar LIMIT/OFFSET en queries
6. Hacer audit log obligatorio para operaciones críticas

### Prioridad MEDIA (Próximo sprint)
7. Unificar tablas de audit_log
8. Agregar timeout absoluto de sesión
9. Mejorar parsing de IP address
10. Considerar MFA para roles críticos

---

## 8. CÓDIGO CORREGIDO PROPUESTO

### auth-v2.ts (Nuevo archivo seguro)

```typescript
'use server';

import { query, pool } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { checkRateLimit, incrementRateLimit, clearRateLimit } from './security';
import { auditLog } from '@/lib/audit-v2';

// Schema de validación
const AuthSchema = z.object({
    userId: z.string().uuid('ID de usuario inválido'),
    pin: z.string()
        .min(4, 'PIN debe tener al menos 4 dígitos')
        .max(8, 'PIN no puede exceder 8 dígitos')
        .regex(/^\d+$/, 'PIN debe contener solo números'),
    locationId: z.string().uuid().optional()
});

const GLOBAL_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'DRIVER', 'QF'];

export async function authenticateUserSecure(
    userId: string,
    pin: string,
    locationId?: string,
    ipAddress?: string
): Promise<{ success: boolean; user?: any; error?: string }> {
    // Validación
    const validated = AuthSchema.safeParse({ userId, pin, locationId });
    if (!validated.success) {
        return { success: false, error: 'Datos de autenticación inválidos' };
    }
    
    const { userId: uid, pin: validatedPin, locationId: locId } = validated.data;
    
    try {
        // 1. Rate Limiting
        const limitCheck = await checkRateLimit(uid);
        if (!limitCheck.allowed) {
            await auditLog({
                userId: uid,
                actionCode: 'LOGIN_BLOCKED',
                entityType: 'USER',
                entityId: uid,
                newValues: { reason: 'Rate limit exceeded' },
                ipAddress
            });
            return { success: false, error: limitCheck.error };
        }
        
        // 2. Obtener usuario (SIN comparar PIN en query)
        const res = await query(`
            SELECT id, name, role, access_pin_hash, assigned_location_id, 
                   token_version, is_active
            FROM users 
            WHERE id = $1
        `, [uid]);
        
        if (res.rowCount === 0) {
            await incrementRateLimit(uid);
            await auditLog({
                userId: uid,
                actionCode: 'LOGIN_FAILED',
                entityType: 'USER',
                entityId: uid,
                newValues: { reason: 'User not found' },
                ipAddress
            });
            return { success: false, error: 'Credenciales inválidas' };
        }
        
        const user = res.rows[0];
        
        // 3. Verificar usuario activo
        if (!user.is_active) {
            await auditLog({
                userId: uid,
                actionCode: 'LOGIN_FAILED',
                entityType: 'USER',
                entityId: uid,
                newValues: { reason: 'User disabled' },
                ipAddress
            });
            return { success: false, error: 'Usuario deshabilitado' };
        }
        
        // 4. Verificar PIN hasheado
        const pinValid = await bcrypt.compare(validatedPin, user.access_pin_hash);
        
        if (!pinValid) {
            await incrementRateLimit(uid);
            await auditLog({
                userId: uid,
                actionCode: 'LOGIN_FAILED',
                entityType: 'USER',
                entityId: uid,
                newValues: { reason: 'Invalid PIN' },
                ipAddress
            });
            return { success: false, error: 'Credenciales inválidas' };
        }
        
        // 5. Verificar autorización por ubicación
        if (locId) {
            const isGlobalAdmin = GLOBAL_ROLES.includes(user.role?.toUpperCase());
            
            if (!isGlobalAdmin && user.assigned_location_id && user.assigned_location_id !== locId) {
                await auditLog({
                    userId: uid,
                    actionCode: 'LOGIN_FAILED',
                    entityType: 'USER',
                    entityId: uid,
                    newValues: { 
                        reason: 'Location unauthorized',
                        attempted: locId,
                        assigned: user.assigned_location_id
                    },
                    ipAddress
                });
                return { success: false, error: 'No tienes contrato en esta sucursal' };
            }
        }
        
        // 6. Actualizar sesión
        await query(`
            UPDATE users 
            SET last_active_at = NOW(),
                last_login_at = NOW(),
                last_login_ip = $2,
                current_context_data = $3,
                token_version = COALESCE(token_version, 1)
            WHERE id = $1
        `, [uid, ipAddress, JSON.stringify({ location_id: locId || 'HQ' })]);
        
        // 7. Limpiar rate limit y registrar éxito
        await clearRateLimit(uid);
        await auditLog({
            userId: uid,
            actionCode: 'LOGIN_SUCCESS',
            entityType: 'USER',
            entityId: uid,
            newValues: { role: user.role, location: locId },
            ipAddress
        });
        
        // 8. Retornar usuario (sin hash)
        delete user.access_pin_hash;
        
        return { 
            success: true, 
            user: {
                ...user,
                token_version: user.token_version || 1
            }
        };
        
    } catch (error) {
        console.error('Auth Error:', error);
        return { success: false, error: 'Error de servidor' };
    }
}

/**
 * Establecer PIN hasheado para usuario
 */
export async function setUserPinSecure(
    userId: string, 
    newPin: string,
    adminId: string
): Promise<{ success: boolean; error?: string }> {
    // Validar PIN
    const pinSchema = z.string()
        .min(4)
        .max(8)
        .regex(/^\d+$/);
    
    const validated = pinSchema.safeParse(newPin);
    if (!validated.success) {
        return { success: false, error: 'PIN inválido' };
    }
    
    // Hashear
    const saltRounds = 10;
    const hashedPin = await bcrypt.hash(newPin, saltRounds);
    
    await query(
        'UPDATE users SET access_pin_hash = $1 WHERE id = $2',
        [hashedPin, userId]
    );
    
    await auditLog({
        userId: adminId,
        actionCode: 'USER_PIN_CHANGE',
        entityType: 'USER',
        entityId: userId,
        newValues: { changed_by: adminId }
    });
    
    return { success: true };
}
```

---

## 9. CHECKLIST DE CORRECCIÓN

### Crítico
- [ ] Migrar PINs a bcrypt hash
- [ ] Corregir SQL injection en INTERVAL
- [ ] Agregar validación Zod a auth functions
- [ ] Parametrizar LIMIT/OFFSET

### Alto
- [ ] Verificar permisos en revokeSession
- [ ] Hacer audit log obligatorio para login
- [ ] Agregar is_active check

### Medio
- [ ] Unificar audit_logs vs audit_log
- [ ] Agregar session timeout absoluto
- [ ] Mejorar parsing de x-forwarded-for
- [ ] Considerar MFA

---

## 10. SCRIPT DE MIGRACIÓN DE PINs

```sql
-- Migración: Agregar columna para PIN hasheado
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_pin_hash VARCHAR(60);

-- Nota: La migración de PINs existentes debe hacerse desde la aplicación
-- porque bcrypt no está disponible nativamente en PostgreSQL

-- Script Node.js para migración:
-- const bcrypt = require('bcryptjs');
-- const users = await query('SELECT id, access_pin FROM users WHERE access_pin IS NOT NULL');
-- for (const user of users.rows) {
--     const hash = await bcrypt.hash(user.access_pin, 10);
--     await query('UPDATE users SET access_pin_hash = $1 WHERE id = $2', [hash, user.id]);
-- }
-- await query('ALTER TABLE users DROP COLUMN access_pin');
```

---

**Próximo archivo a auditar**: `inventory.ts` y `wms.ts`
