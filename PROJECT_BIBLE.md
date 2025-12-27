# PROJECT BIBLE: Farmacias Vallenar Suit (Pharma-Synapse)

**Version:** 3.2 (Secure V2 Actions Era)  
**Role:** Critical Pharmaceutical ERP & Public Consultant  
**Target:** Farmacias Vallenar (Admin, POS & Public Views)  
**Last Updated:** 27 Diciembre 2024

---

## 1. RESUMEN EJECUTIVO

**Pharma-Synapse v3.2** consolida la migración completa a **Server Actions V2 Seguros**, eliminando 50 archivos legacy y estableciendo un nuevo estándar de seguridad con validación Zod, transacciones SERIALIZABLE, y auditoría forense.

### Métricas de Calidad
| Métrica | Valor |
|---------|-------|
| Tests | **236 passed** / 0 failed |
| Build | ✅ Exitoso |
| Archivos V2 | 54 |
| Cobertura Seguridad | 100% acciones protegidas |

### Pilares Tecnológicos
*   **Frontend:** React 18, Vite, Tailwind CSS (Design System Premium).
*   **State Management:** Zustand (Session & Cart) + React Query.
*   **Backend Actions:** Next.js Server Actions V2 (Secure - Zod validated).
*   **Database:** PostgreSQL (Tiger Cloud Production).
*   **Infrastructure:** Docker Ready + Maintenance Mode Middleware.

---

## 2. ARQUITECTURA DE SEGURIDAD V2

### Características de Server Actions V2
- **Validación Zod**: Todos los inputs validados con schemas tipados
- **Transacciones SERIALIZABLE**: Integridad ACID garantizada
- **Bloqueo Pesimista**: `FOR UPDATE NOWAIT` en operaciones críticas
- **PIN con bcrypt**: Autenticación multi-factor para operaciones sensibles
- **Auditoría Completa**: Registro inmutable de todas las acciones

### Archivos Eliminados (Legacy V1)
Se eliminaron **50 archivos** sin sufijo `-v2` de `src/actions/`:
- `treasury.ts`, `inventory.ts`, `sales.ts`, `auth.ts`, etc.
- Excepciones mantenidas: `products.ts`, `public-*.ts`

---

## 3. ARQUITECTURA DE BASE DE DATOS (v3.2)

El sistema opera sobre PostgreSQL (Tiger Cloud). Se ha resuelto una estricta tipificación de IDs.

### Tablas Críticas
*   **products:** Inventario maestro y precios.
*   **terminals:** Puntos de venta (POS). **Nota:** La columna `location_id` es `TEXT`.
*   **cash_register_sessions:** Control de turnos y arqueos.
*   **sales / sale_items:** Transacciones transaccionales ACID.
*   **cash_movements:** Ingresos, Egresos, Aperturas y Cierres.
*   **audit_log:** Registro inmutable de operaciones (V2).

---

## 4. MÓDULOS ACTIVOS & FUNCIONALIDAD

### A. Consultor Público (Smart Search)
*   **Objetivo:** Tótem de auto-consulta de precios y stock.
*   **Features:** Búsqueda Inteligente, Bioequivalencia (Ahorro %), Semáforo de Stock.

### B. Gestión de Caja (POS Fiscal)
*   **Arqueo Dinámico:** Soporte nativo para múltiples métodos de pago.
*   **Escudo de Sesión V2:** Previene sesiones zombie con auto-healing.
*   **PIN Validation:** Operaciones > umbrales requieren PIN de supervisor.

### C. Panel de Administración (Gestión Gerencial)
*   **Audit Log Viewer V2:** Registro inmutable con filtros avanzados.
*   **Maintenance Mode:** Switch global para bloquear acceso.

---

## 5. ESTRUCTURA DE CÓDIGO CLAVE

*   `src/actions/*-v2.ts`: Lógica de servidor segura (`use server`, Zod validated).
*   `src/lib/utils.ts`: Utilidades compartidas (Formatos, Validadores UUID).
*   `src/presentation/store/useStore.ts`: Estado global migrado a V2.
*   `src/middleware.ts`: Control de acceso y Modo Mantenimiento.

---

## 6. PRÓXIMOS PASOS (Roadmap)

*   [x] **Migración V2 Completa:** 54 archivos seguros, 50 legacy eliminados.
*   [x] **Tests 100% Passing:** 236 tests verificados.
*   [ ] **Despliegue Producción:** `vercel --prod`
*   [ ] **Conciliación Financiera (Fase 2):** Justificaciones post-cierre.
*   [ ] **Integración DTE Real:** Conexión con SII para boletas fiscales.

