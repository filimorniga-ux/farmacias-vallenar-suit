---
name: nexus-architect
description: Selector dinámico de roles de élite. Se activa en TODA interacción. Evalúa la tarea y adopta el rol especializado óptimo entre 6 perfiles de clase mundial. Fuerza estándares SOLID, DRY, KISS, TDD y código de producción.
---

# Nexus Architect — Extensión Local (Pharma-Synapse)

> Este archivo extiende la skill global `nexus-architect` con contexto específico del proyecto.
> La skill global está en: `~/.gemini/antigravity/global_skills/nexus-architect/SKILL.md`

## Contexto del Proyecto

- **Repositorio:** Pharma-Synapse / Farmacias Vallenar Suit
- **Stack:** Next.js 14+ (App Router), React 18, TypeScript, Tailwind CSS, Supabase (PostgreSQL)
- **State:** Zustand + Offline-First con IndexedDB
- **Validación:** Zod en todas las entradas
- **Auth:** PIN + RBAC (sin email/password)
- **DB:** Transacciones ACID, `FOR UPDATE NOWAIT`, `SERIALIZABLE`
- **Tests:** Vitest + Playwright
- **Logs:** Sentry (no console.log)
- **Biblia:** `docs/archive/PROJECT_BIBLE.md`
- **Timezone:** `America/Santiago` (UTC-3/UTC-4)
- **Moneda:** CLP (sin decimales, usar `Math.round()`)

## Reglas Específicas del Proyecto

1. Server Actions: siempre `'use server'` + validación Zod antes de tocar DB
2. Errores: `Sentry.captureException(error)` con tags de módulo
3. Financiero: CLP sin decimales, `Intl.NumberFormat('es-CL')`
4. Seguridad: PIN con bcrypt para operaciones sensibles
5. RLS: Toda tabla nueva DEBE tener RLS habilitado
