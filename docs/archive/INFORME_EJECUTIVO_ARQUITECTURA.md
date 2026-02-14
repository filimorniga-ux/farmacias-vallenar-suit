# Informe Ejecutivo de Arquitectura y Datos
**Proyecto:** Farmacias Vallenar Suit  
**Fecha:** 27 de Enero, 2026  
**Estatus:** En Producción (Versión 2.1 - Agentic Era)

---

## 1. Resumen de Alto Nivel

Se ha implementado una arquitectura de **"Data Pipeline" progresiva** para transformar datos no estructurados (Excel/CSV de múltiples orígenes) en un catálogo maestro unificado, enriquecido con IA y listo para operaciones en tiempo real multisucursal.

El sistema opera sobre **Next.js 15** con App Router, **PostgreSQL/TimescaleDB** para persistencia, y un enfoque **Offline-First** usando Zustand para garantizar operación continua incluso sin conexión a internet.

---

## 2. Componentes de la Arquitectura Implementada

### A. Capa de Ingesta (Importación)
- **Script**: `import-excel-data.ts`
- **Función**: Ingesta masiva de planillas Excel de proveedores (Golan, etc.) y sucursales (Santiago, Colchagua).
- **Almacenamiento**: Tabla intermedia `inventory_imports` (Staging Area).
- **Característica Clave**: Almacena data cruda (`raw_title`, `raw_misc` JSONB) sin pérdida de información original.

### B. Capa de Normalización (Metadata Extraction)
- **Script**: `process-metadata.ts`
- **Función**: Extrae y normaliza entidades categóricas desde el campo JSON `raw_misc`.
- **Resultado**: Creación y poblado de tablas maestras relacionales:
    - `categories` (10 identificadas)
    - `laboratories` (157 identificados)
    - `therapeutic_actions` (206 identificadas)
- **Impacto**: Permite filtros estructurados duros, eliminando la dependencia de texto libre sucio.

### C. Capa de Enriquecimiento (AI Processing)
- **Script**: `ai-clean-inventory.ts` (Modo Batch Optimizado)
- **Motor**: OpenAI GPT-4o-mini.
- **Lógica**: Procesa lotes de 20 productos para estandarizar nombres respetando reglas farmacéuticas estrictas:
    - Conservación mandatoria de **Marca** (e.g., "MINTLAB").
    - Conservación mandatoria de **Dosis/Presentación** (e.g., "x 1000 Comp").
- **Eficiencia**: Reducción del 95% en llamadas API mediante procesamiento por lotes.

### D. Capa de Consolidación y Stock (Core Business)
- **Script**: `sync-stock.ts`
- **Función**: Unificación de productos y gestión de inventario multisucursal.
- **Lógica de Unificación**: 
    1. Match por **Código de Barras**.
    2. Match por **SKU**.
    3. Match por **Nombre Normalizado**.
    - Generación de UUIDs y SKUs para productos nuevos.
- **Gestión de Stock**: Tabla `inventory` (Relación M:N entre Products y Locations) para manejar stock diferenciado por sucursal.

### E. Capa de Server Actions (Backend)
- **Ubicación**: `src/actions/*.ts`
- **Módulos implementados**:
    - `inventory-v2.ts` - Ajustes de stock, transferencias
    - `users-v2.ts` - Gestión de usuarios y autenticación
    - `quotes-v2.ts` - Cotizaciones y descuentos
    - `cash-management-v2.ts` - Control de caja
    - `wms-v2.ts` - Operaciones de bodega
- **Patrón**: Transacciones PostgreSQL con `pool.connect()` y rollback automático en errores.

### F. Capa de Consumo (Frontend & Search)
- **Componente**: `UnifiedPriceConsultant.tsx`, `PriceCheckerModal.tsx`
- **Acción**: `searchUnifiedProducts` y `searchProductsAction`
- **Mejoras**:
    - Búsqueda híbrida (Texto Libre + Filtros Estructurados)
    - JOINs dinámicos para mostrar metadata enriquecida (Laboratorio, Categoría) en tiempo real
    - Indicadores visuales de precios (Mejor Precio, Bioequivalencia)
    - Teclado virtual para pantallas táctiles

---

## 3. Estado Actual de Procesos (Snapshot - 27/01/2026)

| Proceso | Estado | Progreso |
| :--- | :--- | :--- |
| **Ingesta Datos Crudos** | ✅ Completado | 20,524 registros importados |
| **Normalización Metadata** | ✅ Completado | Tablas maestras creadas y vinculadas |
| **Sincronización Stock** | ✅ Completado | Links de inventario multisucursal |
| **Limpieza Nombres IA** | ✅ Completado | Productos normalizados |
| **Tests Unitarios** | ✅ Completado | 339+ tests pasando |
| **Tests E2E** | ✅ Corregidos | Flujo de login actualizado |

---

## 4. Arquitectura de Testing

### A. Framework y Herramientas
- **Tests Unitarios**: Vitest (339+ tests pasando)
- **Tests de Hooks**: Vitest (65 tests pasando)
- **Tests E2E**: Playwright
- **Mocking**: `vi.mock()` con patrón inline para `pool.connect`

### B. Flujo de Login para Tests E2E
El sistema utiliza autenticación por PIN, no formulario email/password:

```typescript
// 1. Seleccionar sucursal
await page.click('button:has-text("Farmacia Vallenar santiago")');

// 2. Click en ACCEDER
await page.click('button:has-text("ACCEDER")');

// 3. Seleccionar usuario
await page.click('text=Gerente General 1');

// 4. Ingresar PIN y confirmar
await page.fill('input[type="password"]', '1213');
await page.click('button:has-text("Entrar")');
```

### C. Credenciales de Prueba
| Usuario | PIN | Rol |
|---------|-----|-----|
| Gerente General 1 | 1213 | MANAGER |
| Cajero 1 | 1234 | CASHIER |

---

## 5. Próximos Pasos Técnicos

1. **Optimizar Tests E2E**: Implementar `storageState` para sesiones pre-logueadas y acelerar ejecución.
2. **Dashboard de Compras**: Conectar sugerencias de reposición ("Smart Replenishment") a la data estructurada.
3. **Integración SII**: Finalizar emisión de DTEs (Boletas/Facturas electrónicas).
4. **Multi-sucursal en Tiempo Real**: Sincronización de stock entre sucursales.

---

## 6. Métricas de Calidad

| Métrica | Valor | Objetivo |
|---------|-------|----------|
| Tests Unitarios Pasando | 339+ | ✅ 100% |
| Tests de Hooks Pasando | 65 | ✅ 100% |
| Tests Skipped (Integración) | 2 | ⏭️ Intencional |
| Errores de TypeScript | 0 | ✅ Clean |
| Build Status | ✅ Exitoso | - |

---

> **Farmacias Vallenar Suit** - Arquitectura diseñada para escalar.
