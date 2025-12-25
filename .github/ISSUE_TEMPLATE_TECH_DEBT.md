# 📋 Deuda Técnica: Tests Skipped

## Issue Title
**Refactor: Migrate skipped unit tests to E2E or fix mocks**

## Labels
`tech-debt`, `testing`, `priority:medium`

## Description

### Contexto
Durante la implementación de los módulos v2 (seguridad reforzada), 21 bloques de tests fueron marcados como `skip` debido a problemas complejos con los mocks de `pool.connect`.

### Tests Skipped (67 tests individuales)

| Archivo | Bloques | Tests |
|---------|---------|-------|
| `users-v2.test.ts` | 5 | 18 |
| `cash-management-v2.test.ts` | 2 | 4 |
| `quotes-v2.test.ts` | 3 | 8 |
| `locations-v2.test.ts` | 5 | 19 |
| `security-v2.test.ts` | 6 | 18 |
| **Total** | **21** | **67** |

### Problema Raíz
Los tests usan mocks de `vi.mock('@/lib/db')` pero el patrón de `pool.connect()` → `client.query()` no está siendo capturado correctamente. Los mocks de `createMockClient` no están sincronizados con las llamadas reales de las funciones `*Secure`.

### Opciones de Solución

**Opción A: Migrar a Tests E2E (Recomendado)**
- Usar Playwright + test database real
- Más realista, menos mocking
- Ya tenemos `tests/integration/` preparado

**Opción B: Refactorizar Mocks**
- Implementar factory de mocks más robusta
- Usar `vi.spyOn` en vez de `vi.mock`
- Sincronizar secuencia de queries

**Opción C: Usar MSW (Mock Service Worker)**
- Interceptar a nivel HTTP
- Más cercano a producción

### Criterio de Éxito
- [ ] 0 tests skipped
- [ ] Cobertura > 80% en módulos v2
- [ ] CI/CD con tests verdes obligatorios

### Prioridad
🟡 **Media** - No bloquea producción, pero reduce confianza en cambios futuros.

### Timeline Sugerido
**Q1 2025** - Sprint de Deuda Técnica

---

## Cómo Crear Este Issue

1. Ve a: https://github.com/filimorniga-ux/farmacias-vallenar-suit/issues/new
2. Copia el título y descripción de arriba
3. Añade los labels: `tech-debt`, `testing`, `priority:medium`
4. Crea el issue

---
*Archivo creado: 2025-12-25*
