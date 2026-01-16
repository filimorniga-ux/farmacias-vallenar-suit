# Informe Ejecutivo de Arquitectura y Datos
**Proyecto:** Farmacias Vallenar Suit
**Fecha:** 10 de Enero, 2026
**Estatus:** En Ejecución (Fase de Refinamiento 2.0)

## 1. Resumen de Alto Nivel
Se ha implementado una arquitectura de **"Data Pipeline" progresiva** para transformar datos no estructurados (Excel/CSV de múltiples orígenes) en un catálogo maestro unificado, enriquecido con IA y listo para operaciones en tiempo real multisucursal.

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
- **Gestión de Stock**: Nueva tabla `inventory` (Relación M:N entre Products y Locations) para manejar stock diferenciado por sucursal (Santiago vs Colchagua).

### E. Capa de Consumo (Frontend & Search)
- **Componente**: `UnifiedPriceConsultant.tsx`
- **Acción**: `searchUnifiedProducts` y `searchProductsAction`.
- **Mejoras**:
    - Búsqueda híbrida (Texto Libre + Filtros Estructurados).
    - JOINs dinámicos para mostrar metadata enriquecida (Laboratorio, Categoría) en tiempo real.
    - Indicadores visuales de precios (Mejor Precio, Bioequivalencia).

## 3. Estado Actual de Procesos (Snapshot)
| Proceso | Estado | Progreso (Est.) |
| :--- | :--- | :--- |
| **Ingesta Datos Crudos** | ✅ Completado | 20,524 registros importados |
| **Normalización Metadata** | ✅ Completado | Tablas maestras creadas y vinculadas |
| **Sincronización Stock** | 🔄 En Ejecución | ~25% (3,062 links creados / 5,223 productos) |
| **Limpieza Nombres IA** | 🔄 En Ejecución | ~5% (1,080 productos limpiados) |

## 4. Próximos Pasos Técnicos
1. **Finalizar Sincronización**: Permitir que el cron job de stock termine de poblar la tabla `inventory`.
2. **Dashboard de Compras**: Conectar las sugerencias de reposición ("Smart Replenishment") a la nueva data estructurada para mejorar la precisión de los pedidos sugeridos.
