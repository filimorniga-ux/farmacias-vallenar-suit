# PROJECT BIBLE: Farmacias Vallenar Suit (Pharma-Synapse)

**Version:** 3.1 (Fiscal Control & Security Era)
**Role:** Critical Pharmaceutical ERP & Public Consultant
**Target:** Farmacias Vallenar (Admin, POS & Public Views)

---

## 1. RESUMEN EJECUTIVO

**Pharma-Synapse v3.1** consolida la gestión operativa con un enfoque obsesivo en el control financiero y la seguridad. Se han integrado módulos avanzados de Arqueo de Caja Dinámico, Protección de Sesiones (Concurrency Guards) y Auditoría Forense. La arquitectura ahora soporta "Fallbacks" inteligentes para garantizar la continuidad operativa incluso ante inconsistencias de datos.

### Pilares Tecnológicos
*   **Frontend:** React 18, Vite, Tailwind CSS (Design System Premium).
*   **State Management:** Zustand (Session & Cart) + React Query.
*   **Backend Actions:** Next.js Server Actions (Secure).
*   **Database:** PostgreSQL (Producción).
*   **Infrastructure:** Docker Ready + Maintenance Mode Middleware.

---

## 2. ARQUITECTURA DE BASE DE DATOS (v3.1)

El sistema opera sobre PostgreSQL. Se ha resuelto una estricta tipificación de IDs.

### Tablas Críticas
*   **products:** Inventario maestro y precios.
*   **terminals:** Puntos de venta (POS). **Nota:** La columna `location_id` es `TEXT`, mientras otras tablas usan `UUID`. *Mitigación:* Se implementó lógica de Fallback en backend.
*   **cash_register_sessions:** Control de turnos y arqueos.
*   **sales / sale_items:** Transacciones transaccionales ACID.
*   **cash_movements:** Ingresos, Egresos, Aperturas y Cierres.

---

## 3. MÓDULOS ACTIVOS & FUNCIONALIDAD

### A. Consultor Público (Smart Search)
*   **Objetivo:** Tótem de auto-consulta de precios y stock.
*   **Features:** Búsqueda Inteligente, Bioequivalencia (Ahorro %), Semáforo de Stock.

### B. Gestión de Caja (POS Fiscal)
*   **Arqueo Dinámico:**
    *   Soporte nativo para Efectivo, Débito, Crédito, Transferencia, Cheque.
    *   **Drill-Down:** Click en los montos para ver detalle transacción por transacción.
    *   **Excel Export:** Reporte financiero detallado con hoja de resumen contable.
*   **Escudo de Sesión (Session Guard):**
    *   Previene "Zombie Shifts" (Sesiones abiertas en servidor pero cerradas en local).
    *   **Auto-Healing:** Detecta bloqueos y ofrece botón de "Liberación Forzada" auditada.
    *   Verificación de propiedad vía `localStorage` vs DB.

### C. Panel de Administración (Gestión Gerencial)
*   **Audit Log Viewer (Seguridad):**
    *   Registro inmutable de acciones críticas (Logins, Cierres Forzados, Cambios de Precio).
    *   Distinción visual de actores (Rojo=Alerta, Azul=Info).
*   **Maintenance Mode:**
    *   Switch global para bloquear acceso a usuarios durante despliegues (`MAINTENANCE_MODE=true`).

---

## 4. REGLAS DE NEGOCIO IMPLEMENTADAS

1.  **Compatibilidad Híbrida de IDs:**
    *   Debido a migraciones previas, algunos IDs en `terminals` son Texto plano. El backend utiliza queries híbridas (Fallback) y validadores personalizados (`isValidUUID`) en `src/lib/utils.ts` para evitar fallos.

2.  **Seguridad de Turnos:**
    *   Un cajero no puede abrir caja si tiene un turno previo "colgado".
    *   Un administrador puede forzar el cierre, dejando un rastro indeleble en la Auditoría.

3.  **Integridad Financiera:**
    *   Las ventas no se borran. Las devoluciones generan movimientos de caja negativos (Egresos).
    *   El stock se descuenta atómicamente dentro de la misma transacción de venta.

---

## 5. ESTRUCTURA DE CÓDIGO CLAVE

*   `src/actions/*.ts`: Lógica de servidor segura (`use server`).
*   `src/lib/utils.ts`: Utilidades compartidas (Formatos, Validadores UUID).
*   `src/presentation/store/useStore.ts`: Estado global del cliente (Sesión, Carrito).
*   `src/middleware.ts`: Control de acceso y Modo Mantenimiento.

---

## 6. PRÓXIMOS PASOS (Roadmap)

*   [ ] **Conciliación Financiera (Fase 2):** Herramienta para corregir diferencias de arqueo post-cierre (Justificaciones).
*   [ ] **Reporte de Mermas:** Módulo específico para pérdidas de inventario.
*   [ ] **Integración DTE Real:** Conexión con SII para boletas fiscales.
