# AGENTS.md — Guía de Auditoría para Codex/AI Agents

## Descripción del proyecto

**Farmacias Vallenar** es una aplicación web para la gestión de farmacias.
Stack: **Next.js 14 (App Router) + TypeScript + Supabase (PostgreSQL + Auth + Edge Functions) + Vercel + Playwright (E2E) + Vitest (unit)**.

## Módulos críticos (revisar con mayor profundidad)

| Módulo | Ruta | Riesgo |
|--------|------|--------|
| Autenticación | `src/app/(auth)/` | CRÍTICO |
| Autorización / RBAC | `src/actions/`, `src/domain/` | CRÍTICO |
| Caja / Ventas | `src/app/(dashboard)/caja/` | ALTO |
| Inventario | `src/app/(dashboard)/inventario/` | ALTO |
| Billing / Pagos | `src/app/(dashboard)/billing/` | ALTO |
| Supabase RLS | `migrations/`, `db/` | ALTO |
| Edge Functions | `src/api/`, endpoints internos | ALTO |
| Reportes | `src/app/(dashboard)/reportes/` | MEDIO |
| Configuración | `src/config/` | MEDIO |

## Reglas para el agente

### Severidades

- **CRÍTICO**: puede romper producción, pérdida de datos, brecha de seguridad
- **ALTO**: afecta funcionalidad core, bug probable en flujos principales
- **MEDIO**: bug menor, degradación de UX, deuda técnica significativa
- **BAJO**: mejora de código, estilo, optimización menor

### BLOCKER (no deployar sin resolver)

- Cualquier CRÍTICO de seguridad o autenticación
- RLS deshabilitado en tablas con datos sensibles
- Secretos expuestos en código cliente
- Server Actions sin validación de sesión activa

### Formato de cada hallazgo

```markdown
## [SEVERIDAD] Título del problema

- **Archivo**: ruta/archivo.ext (función o línea si aplica)
- **Descripción**: qué está mal y por qué
- **Impacto**: qué puede pasar en producción
- **Reproducción**: cómo verificarlo (si aplica)
- **Corrección**: código o pasos concretos
```

## Arquitectura conocida

- **Framework**: Next.js 14 App Router con Server Components y Server Actions
- **BaaS**: Supabase (Auth, DB PostgreSQL, Storage)
- **TypeScript** en todo el proyecto
- **UI**: componentes en `src/components/`, Tailwind CSS
- **Tests**: Playwright (E2E en `tests/`), Vitest (unit)
- **Deploy**: Vercel (producción), Docker (posible staging)
- **Observabilidad**: Sentry (`sentry.client.config.ts`, `sentry.server.config.ts`)

## Variables de entorno sensibles

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` → cliente (normal)
- `SUPABASE_SERVICE_ROLE_KEY` → solo server-side
- Claves de pago u otras externas → solo en Vercel env / secretos

## Qué no revisar

- `node_modules/`
- `build/`, `out/`, `.next/`
- `playwright-report/`, `coverage/`, `test-results/`

## Proceso de auditoría recomendado

1. Mapa del sistema
2. Auditoría global (arquitectura + calidad + bugs)
3. Auditoría de seguridad (separada)
4. Auditoría de rendimiento
5. Auditoría de mantenibilidad
6. Auditoría de pruebas/cobertura
7. Informe ejecutivo consolidado
