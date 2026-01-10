# Informe Ejecutivo de Arquitectura de Software
## Farmacias Vallenar Suit (FVS)

**Fecha:** 10 de Enero, 2026
**Versión:** 1.0.0
**Estado:** Producción / Evolución Activa

---

### 1. Resumen Ejecutivo
**Farmacias Vallenar Suit** es una plataforma ERP (Enterprise Resource Planning) integral y autónoma diseñada para la gestión operativa, comercial y logística de la cadena de farmacias. Su arquitectura moderna, basada en la nube, permite una operación unificada entre sucursales (Santiago y Colchagua), ofreciendo capacidades de venta en tiempo real (POS), reposición inteligente (Smart Replenishment) y analítica financiera centralizada.

La solución se destaca por su enfoque "Autónomo": cierra el ciclo comercial (Venta -> Quiebre de Stock -> Sugerencia de Compra -> Orden de Compra) con mínima intervención humana.

---

### 2. Stack Tecnológico

La plataforma está construida sobre un stack moderno, escalable y tipeado estáticamente para asegurar robustez y mantenibilidad.

#### **Frontend (Capa de Presentación)**
*   **Framework:** **Next.js 14** (App Router Architecture).
*   **Lenguaje:** **TypeScript** (Tipado estricto para interfaces y componentes).
*   **UI Library:** **React 18** + `lucide-react` (Iconografía).
*   **Estilos:** **Tailwind CSS** (Utility-first framework para diseño responsive y consistente).
*   **Animaciones:** `framer-motion` (Transiciones fluidas de interfaz).
*   **State Management:** `zustand` (Gestión ligera de estado global para sesión y carritos).

#### **Backend (Lógica de Negocio & Datos)**
*   **Arquitectura:** **Server Actions** (Next.js). Elimina la necesidad de una API REST separada, permitiendo llamadas a funciones de servidor directamente desde el cliente con seguridad integrada.
*   **Database Driver:** `pg` (node-postgres) para conexiones directas y eficientes a SQL.
*   **Database:** **PostgreSQL** (Hospedada en la nube).
    *   Diseño Relacional Normalizado.
    *   Uso extensivo de Índices y UUIDs.
    *   Transacciones ACID para operaciones críticas (Ventas).

#### **Infraestructura & Herramientas**
*   **Control de Versiones:** Git.
*   **Entorno:** Node.js.
*   **Seguridad:** RBAC (Role-Based Access Control) simplificado con autenticación por PIN para operaciones rápidas en punto de venta.

---

### 3. Arquitectura de Módulos

El sistema está modularizado por dominios de negocio para facilitar la escalabilidad.

#### **A. Módulo Dashboard (Centro de Mando)**
*   **Ruta:** `/` (Raíz).
*   **Función:** Visión holística del negocio en tiempo real.
*   **Componentes Clave:**
    *   **KPI Cards:** Métricas vivas conectadas a DB (Ventas Hoy, Valor Inventario, Pendientes).
    *   **Unified Price Consultant:** Buscador global de precios y stock entre sucursales y proveedores.
    *   **Comparativa de Sucursales:** Gráfico de ventas Santiago vs Colchagua.
    *   **System Incidents Banner:** Alertas de infraestructura (Internet, Luz, Servidores).

#### **B. Módulo POS (Quick Web Point of Sale)**
*   **Ruta:** `/sales/pos`.
*   **Tecnología:** Optimistic UI Updates + Transacciones SQL.
*   **Funcionalidades:**
    *   Selección de Sucursal de Origen (Santiago/Colchagua).
    *   Búsqueda ultra-rápida (Barcode/SKU/Nombre).
    *   Carrito de compras dinámico.
    *   **Checkout Atómico:** Descuenta stock y registra venta en una sola transacción DB segura.

#### **C. Módulo Smart Replenishment (Abastecimiento)**
*   **Ruta:** `/procurement/orders`.
*   **Motor:** Algoritmo de Arbitraje de Precios.
*   **Funcionalidades:**
    *   **Detección de Quiebres:** Monitoreo constante de stock crítico (<= 5 unidades).
    *   **Match de Proveedores:** Cruce automático de inventario interno vs catálogos de proveedores (ej. Golan).
    *   **Sugerencia Inteligente:** Recomienda comprar al proveedor más barato o cotizar genérico.
    *   **Generador de Órdenes:** Creación de listas de pedido unificadas.

#### **D. Módulo de Inventario & Datos**
*   **Base de Datos:** Tabla central `inventory_imports`.
*   **Ingesta:** Scripts de migración y lectura de archivos Legacy (CSV/Excel) unificados.

---

### 4. Flujos de Usuario (Landings & Navegación)

#### **Landing de Selección de Sucursal/Rol (Login)**
*   **Diseño:** Interfaz limpia estilo "Kiosk".
*   **Funcionalidad:**
    *   El usuario selecciona su perfil (Cajero, Químico, Admin).
    *   Ingreso mediante PIN seguro.
    *   Redirección inteligente basada en Rol (ej. Cajero -> POS, Manager -> Dashboard).

#### **Landing de Dashboard (Main App)**
*   **Layout:** Header con accesos rápidos, cuerpo con Widgets y Footer informativo.
*   **Navegación:** Cards interactivas que llevan a los submódulos.
*   **Seguridad:** Visualización condicional de datos sensibles (Márgenes, Costos) mediante "Modo Público/Privado" (Toggle Eye Icon).

---

### 5. Estructura de Base de Datos (Core Tables)

1.  **`inventory_imports`**: Tabla maestra de productos. Consolida inventario propio y listas de proveedores.
    *   Campos Clave: `id`, `branch_source`, `raw_stock`, `raw_price`, `raw_barcodes`.
2.  **`sales_headers`**: Cabeceras de transacciones de venta.
    *   Campos Clave: `id` (UUID), `total_amount`, `branch_source`, `created_at`.
3.  **`sales_items`**: Detalle línea a línea de cada venta.
    *   Campos Clave: `sale_id`, `product_name`, `quantity`, `subtotal`.

---

### 6. Conclusión
**Farmacias Vallenar Suit** representa una arquitectura madura y orientada al rendimiento. Al desacoplar la lógica compleja en **Server Actions** y mantener una interfaz de usuario reactiva y ligera, el sistema logra tiempos de respuesta inmediatos esenciales para el retail, mientras mantiene una integridad de datos estricta en el backend.
