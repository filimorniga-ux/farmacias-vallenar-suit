# PROJECT BIBLE: Farmacias Vallenar Suit (Pharma-Synapse)

**Version:** 3.0 (Smart Consultant & Admin Era)  
**Role:** Critical Pharmaceutical ERP & Public Consultant  
**Target:** Farmacias Vallenar (Admin & Public Views)

---

## 1. RESUMEN EJECUTIVO

**Pharma-Synapse v3.0** evoluciona hacia una arquitectura híbrida robusta, priorizando la Experiencia de Usuario (Consultor Público) y la Gestión Administrativa ágil. El backend ha migrado a un ORM profesional (SQLAlchemy) para soportar PostgreSQL en producción, manteniendo la simplicidad de SQLite para desarrollo.

### Pilares Tecnológicos
*   **Frontend:** React 18, Vite, Tailwind CSS (Design System Premium).
*   **State Management:** React Query (TanStack Query) v5.
*   **Backend Architecture:** FastAPI + SQLAlchemy (Sync) + Pydantic.
*   **Database:** PostgreSQL (Producción) / SQLite (Desarrollo).
*   **Infrastructure:** Docker Ready.

---

## 2. ARQUITECTURA DE BASE DE DATOS (v3.0 CORE)

El sistema opera sobre una base de datos relacional optimizada para búsquedas rápidas y gestión de inventario.

### Esquema Actual (`productos`)

Este es el modelo central simplificado para la versión 3.0, enfocado en venta y consulta pública.

```sql
CREATE TABLE productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku VARCHAR INDEXED,            -- Código interno / Barra
    nombre_comercial VARCHAR INDEXED, -- Nombre búsqueda
    nombre_normalizado VARCHAR,     -- Para búsquedas insensibles a acentos
    principio_activo VARCHAR INDEXED, -- Para lógica de Bioequivalencia
    laboratorio VARCHAR,
    categoria VARCHAR,              -- Clasificación (Medicamento, Insumo...)
    precio INTEGER,                 -- Precio de Venta
    stock INTEGER,                  -- Existencias Físicas
    isp_id VARCHAR,                 -- Registro ISP
    cenabast_id VARCHAR,            -- Código Cenabast
    es_bioequivalente BOOLEAN DEFAULT FALSE, -- Flag visual ("Cintillo Amarillo")
    es_generico BOOLEAN DEFAULT FALSE        -- Flag tipo de producto
);
```

> **Nota:** La arquitectura soporta escalado a PostgreSQL cambiando únicamente la `DATABASE_URL`.

---

## 3. ESTRUCTURA DE DIRECTORIOS

El proyecto se divide claramente en Backend (API) y Frontend (SPA).

```text
/
├── backend/
│   ├── main.py              # Entrypoint FastAPI (Routes & Logic)
│   ├── models.py            # Modelos SQLAlchemy (Tablas)
│   ├── database.py          # Configuración de Conexión (Engine/Session)
│   ├── seed.py              # Script ETL para carga inicial de datos
│   └── requirements.txt     # Dependencias Python
│
├── frontend/
│   ├── src/
│   │   ├── components/      # UI Reutilizable (ProductCard, SearchBar, Modal)
│   │   ├── pages/           # Vistas (Consultor.tsx, AdminDashboard.tsx)
│   │   ├── lib/             # Utilidades (Axios config, Helpers)
│   │   └── App.tsx          # Router & Layout
│   ├── tailwind.config.js   # Temas y Colores Corporativos
│   └── vite.config.ts       # Build Config
```

---

## 4. MÓDULOS ACTIVOS & FUNCIONALIDAD

### A. Consultor Público (Smart Search)
*   **Ruta:** `/`
*   **Objetivo:** Permitir a clientes consultar precios y stock en tótem o web.
*   **Features:**
    *   **Búsqueda Inteligente:** Encuentra por nombre comercial o principio activo.
    *   **Inteligencia de Precios:** Detecta y sugiere automáticamente bioequivalentes más económicos (Ahorro %).
    *   **Semáforo de Stock:**
        *   🟢 Disponible (Stock > 0)
        *   🟡 Por Encargo (Stock = 0, Precio > 0)
        *   ⚪ Solo Referencia (Sin Stock/Precio)
    *   **Ficha Técnica:** Modal con detalles, normativa gráfica del precio y accesos directos (simulados) a Ficha Farmacopea/ISP.

### B. Panel de Administración (Gestión Gerencial)
*   **Ruta:** `/admin`
*   **Seguridad:** Acceso protegido por contraseña compartida (**"1213"**) para Gerentes y Administradores.
*   **Features:**
    *   **KPI Dashboard:** Métricas en tiempo real:
        *   📉 Stock Crítico (< 5 unidades)
        *   ⚠️ Productos sin precio ($0)
        *   📦 Total de productos activos
    *   **DataGrid de Inventario:** Tabla paginada con búsqueda rápida.
    *   **Edición Rápida (Live Edit):**
        *   Modificación de **Precio**
        *   Modificación de **Stock**
        *   Modificación de **Laboratorio/Nombre**
    *   **Sincronización:** Los cambios impactan inmediatamente en el Consultor Público.

---

## 5. REGLAS DE NEGOCIO IMPLEMENTADAS

1.  **Lógica "Bioequivalente Primero":**
    *   Si un usuario busca un medicamento de marca costoso, el sistema busca activamente alternativas con el mismo `principio_activo` que tengan `precio < producto_original` y `stock > 0`.
    *   Se muestra el % de ahorro destacado.

2.  **Estados de Venta:**
    *   El sistema infiere el estado de venta (`DISPONIBLE`, `POR ENCARGO`, `REFERENCIA`) basándose puramente en la combinación de `stock` y `precio`. No existe un campo "status" manual, se calcula dinámicamente.

3.  **Normalización de Datos:**
    *   Al crear/editar productos, los nombres se normalizan a MAYÚSCULAS para consistencia en búsquedas.

---

## 6. PRÓXIMOS PASOS (Roadmap)

*   [ ] **Migración PostgreSQL Completa:** Desplegar base de datos en Supabase/RDS.
*   [ ] **Autenticación JWT:** Reemplazar password simple por usuarios reales en BD.
*   [ ] **Historial de Cambios:** Log de auditoría para precios modificados.
*   [ ] **Integración DTE:** Emisión de boletas electrónicas desde el POS.
