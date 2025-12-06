# PROJECT BIBLE: Farmacias Vallenar Suit (Pharma-Synapse)

**Version:** 2.2 (Biometric Era)  
**Role:** Critical Pharmaceutical ERP  
**Target:** High-volume pharmacies in remote/mining areas (Chile).

---

## 1. RESUMEN EJECUTIVO

**Pharma-Synapse** es un ERP farmacéutico de misión crítica diseñado para operar en entornos de conectividad inestable (Offline-First). A diferencia de los POS tradicionales, integra lógica "Agéntica" (IA determinista) para asistir en la toma de decisiones clínicas y de abastecimiento.

### Pilares Tecnológicos
*   **Frontend:** React 18, Vite, Tailwind CSS, Lucide React.
*   **State Management:** Zustand (Persistencia Local + Sincronización).
*   **Backend Architecture:** "Agentic Postgres" (Supabase/PostgreSQL 15+).
*   **Compliance:** Normativa Chilena (ISP, SII, Dirección del Trabajo).

---

## 2. ARQUITECTURA DE BASE DE DATOS (SQL CORE)

Este esquema define la estructura de datos relacional estricta sobre la cual opera el sistema.

```sql
-- EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ESTRUCTURA ORGANIZACIONAL (MULTITIENDA)
CREATE TYPE location_type AS ENUM ('HQ', 'STORE', 'WAREHOUSE');

CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL, -- e.g. "Farmacia Vallenar Centro"
    type location_type NOT NULL,
    rut VARCHAR(20) NOT NULL, 
    address VARCHAR(255),
    config JSONB DEFAULT '{}', 
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE warehouses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID REFERENCES locations(id), -- Pertenece a una sucursal física
    name VARCHAR(100) NOT NULL, -- e.g. "Sala de Ventas", "Bodega Trasera"
    is_active BOOLEAN DEFAULT TRUE
);

-- 2. SEGURIDAD & STAFF (RRHH)
CREATE TYPE user_role AS ENUM ('MANAGER', 'ADMIN', 'CASHIER', 'WAREHOUSE', 'DRIVER');
CREATE TYPE contract_type AS ENUM ('INDEFINIDO', 'PLAZO_FIJO');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rut VARCHAR(20) UNIQUE NOT NULL, -- Identificador Legal Chileno
    full_name VARCHAR(150) NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255), -- Para acceso Web
    pin_hash VARCHAR(255) NOT NULL, -- Para acceso rápido POS/Kiosco
    role user_role NOT NULL,
    location_id UUID REFERENCES locations(id),
    
    -- Datos Laborales (Compliance DT)
    base_salary INTEGER,
    contract_type contract_type,
    health_system VARCHAR(50), -- FONASA/ISAPRE
    pension_fund VARCHAR(50), -- AFP
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. MAESTRO DE PRODUCTOS
CREATE TYPE control_level AS ENUM ('NONE', 'RECETA_SIMPLE', 'RECETA_RETENIDA', 'ESTUPEFACIENTE');
CREATE TYPE storage_cond AS ENUM ('AMBIENTE', 'REFRIGERADO', 'CONGELADO');
CREATE TYPE abc_class AS ENUM ('A', 'B', 'C');

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL, -- Nombre Comercial
    dci VARCHAR(150), -- Denominación Común Internacional
    category VARCHAR(50), -- Medicamento, Insumo, Belleza
    
    -- Reglas de Negocio
    control_level control_level DEFAULT 'NONE',
    storage_condition storage_cond DEFAULT 'AMBIENTE',
    abc_classification abc_class DEFAULT 'C',
    allows_commission BOOLEAN DEFAULT FALSE, -- Regla "Ley de Fármacos II" (Anti-Canela)
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- 4. INVENTARIO LOTE A LOTE (FEFO)
CREATE TYPE batch_status AS ENUM ('AVAILABLE', 'RESERVED', 'QUARANTINE', 'EXPIRED', 'SOLD');

CREATE TABLE inventory_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id),
    warehouse_id UUID REFERENCES warehouses(id), -- STOCK RESIDE EN BODEGA, NO EN SUCURSAL
    
    lot_number VARCHAR(50) NOT NULL,
    expiry_date DATE NOT NULL,
    
    quantity_real INTEGER NOT NULL CHECK (quantity_real >= 0),
    quantity_reserved INTEGER DEFAULT 0,
    
    unit_cost INTEGER NOT NULL, -- Valorización PPP o Última Compra
    sale_price INTEGER NOT NULL,
    
    status batch_status DEFAULT 'AVAILABLE',
    created_at TIMESTAMP DEFAULT NOW()
);

-- 5. TRANSACCIONES DE VENTA (POS)
CREATE TABLE sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID REFERENCES locations(id), -- Sucursal Contable
    terminal_id VARCHAR(50) REFERENCES terminals(id), -- Punto de Venta específico
    user_id UUID REFERENCES users(id), -- Cajero
    customer_rut VARCHAR(20), -- Cliente (CRM)
    
    total_amount INTEGER NOT NULL,
    payment_method VARCHAR(50), -- CASH, DEBIT, CREDIT, AGREEMENT
    
    dte_xml TEXT, -- Respaldo XML Boleta Electrónica SII
    dte_folio INTEGER,
    
    timestamp TIMESTAMP DEFAULT NOW()
);

CREATE TABLE sale_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID REFERENCES sales(id),
    batch_id UUID REFERENCES inventory_batches(id), -- Trazabilidad exacta del lote vendido
    
    quantity INTEGER NOT NULL,
    unit_price INTEGER NOT NULL,
    total_price INTEGER NOT NULL
);

-- 6. GESTION DE CAJAS & TERMINALES
CREATE TABLE terminals (
    name VARCHAR(100) NOT NULL,
    location_id UUID REFERENCES locations(id),
    status VARCHAR(20) DEFAULT 'CLOSED', -- OPEN, CLOSED
    allowed_users JSONB DEFAULT '[]', -- Array de User IDs permitidos
    current_cashier_id UUID, -- Usuario actual si está abierta
    created_at TIMESTAMP DEFAULT NOW()
);

-- 7. PROVEEDORES & DOCUMENTOS
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rut VARCHAR(20) UNIQUE NOT NULL,
    business_name VARCHAR(150) NOT NULL,
    fantasy_name VARCHAR(150),
    contact_email VARCHAR(100),
    payment_terms VARCHAR(50), -- CONTADO, 30_DIAS, etc.
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE cash_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID REFERENCES locations(id), -- Reference to terminals/locations
    user_id UUID REFERENCES users(id),     -- Who made the movement
    type TEXT CHECK (type IN ('EXPENSE', 'WITHDRAWAL', 'EXTRA_INCOME', 'OPENING', 'CLOSING')),
    amount NUMERIC NOT NULL,
    reason TEXT,
    timestamp TIMESTAMP DEFAULT NOW()
);

CREATE TABLE supplier_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID REFERENCES suppliers(id),
    type VARCHAR(50) NOT NULL, -- FACTURA, NOTA_CREDITO, GUIA_DESPACHO
    number VARCHAR(50) NOT NULL, -- Folio
    amount INTEGER NOT NULL,
    issue_date DATE,
    due_date DATE,
    status VARCHAR(20) DEFAULT 'PENDING',
    related_po_id UUID, -- Purchase Order ID
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 3. ESTRUCTURA DE DIRECTORIOS (FRONTEND)

El proyecto sigue una arquitectura Clean/Layered adaptada a React.

```text
src/
├── domain/                      # Lógica de Negocio Pura (Agnóstica de UI)
│   ├── db/
│   │   └── schema.ts            # Blueprint SQL (Referencia)
│   ├── logic/
│   │   ├── clinical.ts          # Validaciones DDI (Interacciones)
│   │   ├── clinicalAgent.ts     # IA Copilot (Búsqueda semántica, Upsell)
│   │   ├── compliance.ts        # Cálculos Legales (Sueldos Chile, DTE)
│   │   ├── purchasingAgent.ts   # IA Supply Chain (Sugerencias de compra)
│   │   └── scm.ts               # Cálculos de Stock Crítico
│   ├── security/
│   │   └── SecurityService.ts   # Matriz RBAC (Permisos)
│   └── types.ts                 # Definiciones TypeScript Maestras
│
├── infrastructure/              # Comunicación con el mundo exterior
│   └── printer/
│       └── PrinterService.ts    # Generación de PDF, Tickets Térmicos (80mm)
│
├── presentation/                # Capa de UI (React Components)
│   ├── components/
│   │   ├── clinical/            # Módulos Clínicos
│   │   │   └── ClinicalSidebar.tsx # Copiloto IA (Chat & Alertas)
│   │   ├── hr/                  # Recursos Humanos
│   │   │   ├── AttendanceWall.tsx  # Kiosco Reloj Control
│   │   │   ├── PayrollManager.tsx  # Motor de Remuneraciones
│   │   │   └── ...
│   │   ├── inventory/
│   │   │   └── StockAdjustmentModal.tsx # Recepción Ciega/Ajustes
│   │   ├── scm/                 # Supply Chain
│   │   │   └── KanbanBoard.tsx  # Tablero de Compras
│   │   ├── POSMainScreen.tsx    # Núcleo de Venta
│   │   ├── SidebarLayout.tsx    # Layout Principal
│   │   └── ... (Modales Genéricos)
│   │
│   ├── pages/
│   │   ├── AccessControlPage.tsx # Modo Kiosco (Tablet)
│   │   ├── AnalyticsPage.tsx     # Dashboard BI
│   │   ├── InventoryPage.tsx     # Maestro Inventario
│   │   ├── LandingPage.tsx       # Selección de Rol
│   │   └── ...
│   │
│   └── store/
│       └── useStore.ts          # Global State (Zustand) - Base de Datos en Memoria
```

---

## 4. REGLAS DE NEGOCIO CRÍTICAS ("HARD RULES")

El sistema implementa restricciones vía código que no pueden ser saltadas por el usuario:

1.  **Anti-Canela (Ley de Fármacos):**
    *   El sistema calcula comisiones de venta, pero excluye explícitamente productos categorizados como `medicamento` en el cálculo de incentivos, fomentando la venta ética.

2.  **Trazabilidad FEFO (First Expired, First Out):**
    *   Al vender, el sistema descuenta stock del lote con fecha de vencimiento más próxima, no del último ingresado.

3.  **Seguridad Farmacéutica (Controlados):**
    *   La venta de productos con `controlled_level` (Estupefacientes/Psicotrópicos) o con alertas de temperatura (`isHighTemp`) bloquea la caja y exige un **PIN de Supervisor/QF** para continuar.

4.  **Ceguera Operativa (Blind Receiving):**
    *   El módulo de recepción de mercadería no muestra la cantidad esperada de la factura XML al bodeguero. Este debe contar y escanear "a ciegas" para evitar robos hormiga.

5.  **Caja Cuadrada (Blind Cash Count):**
    *   El cajero no ve el "teórico" del sistema al cerrar turno. Debe ingresar lo que tiene en la gaveta manualmente. El sistema calcula la diferencia (Sobrante/Faltante).

6.  **Kiosco de Asistencia Aislado:**
    *   El módulo `/access-control` funciona sin sesión de usuario logueado, permitiendo solo marcajes mediante PIN, y bloquea la navegación hacia el ERP comercial.

---

### MÓDULO RR.HH. & KIOSCO HÍBRIDO (v2.2)

**Tecnología:**
* **Kiosco Híbrido:** `Fullscreen API` para bloqueo. Funciona como **Verificador de Precios** cuando está inactivo y **Reloj Control** cuando el empleado se identifica.
* **Biometría:** Integración con `WebAuthn` para soporte de huella digital.
* **Tiempo Real:** Sincronización NTP simulada para evitar fraude horario.

**Reglas de Negocio (Hard Rules):**
1.  **Activación Gerencial:** El modo Kiosco solo puede ser activado/desactivado por un usuario `MANAGER`.
2.  **Máquina de Estados:**
    * `NOT_ARRIVED` -> Permite Entrada.
    * `PRESENT` -> Permite Colación/Salida.
    * `ON_BREAK` -> Solo permite Volver de Colación.
    * `LICENSE` -> Bloqueo total de marcaje.
3.  **Nómina Chilena:** Cálculo automático de Haberes (Base + Gratificación 4.75 IMM + Comisiones) menos Descuentos (AFP, Salud 7%/UF, Cesantía).

**Componentes Clave:**
* `AccessControlPage.tsx` (Kiosco Híbrido + Verificador Precios).
* `AttendanceWall.tsx` (Grid de asistencia visual).
* `PayrollManager.tsx` (Motor de cálculo de sueldos).
* `ContractEditor.tsx` (Configuración de parámetros laborales).

**Modelo de Datos (Entidades RR.HH.):**
* **EmployeeProfile:** Incluye `biometricHash` (huella/WebAuthn), `labor_data` (reglas contractuales), `accessPin` y `role`.
* **LocationConfig:** Campo `kiosk_enabled` para controlar activación del modo kiosco por sucursal.

---

## 5. MÓDULOS ACTIVOS & ESTADO

| Módulo | Estado | Características Clave |
| :--- | :--- | :--- |
| **POS (Caja)** | ✅ Prod-Ready | Venta rápida, Gestión de Terminales (Apertura/Cierre), Control Temperaturas. |
| **Clinical Copilot** | ✅ Beta | Sidebar IA con búsqueda semántica ("dolor de cabeza") y alertas de seguridad geriátrica. |
| **Inventario** | ✅ Prod-Ready | Trazabilidad por Lote, Kardex de Movimientos, Seed Data Global. |
| **Proveedores** | ✅ Prod-Ready | Directorio, Gestión de Documentos (Facturas/NC), Exportación Excel. |
| **Supply Chain** | ✅ Beta | Tablero Kanban, Agente de Compras que sugiere reposición automática. |
| **RR.HH. & Kiosco** | ✅ Prod-Ready | Kiosco biométrico/verificador de precios, Muro de Asistencia, Nómina Chile. |
| **Reportes & Export** | ✅ Prod-Ready | Selección Avanzada (Fecha/ID), Exportación Excel (Clientes, Ventas, Stock). |
| **Seguridad** | ✅ Prod-Ready | Bóveda de Usuarios, Reset de PIN, Roles jerárquicos. |

---

## 6. INTELIGENCIA ARTIFICIAL & AGENTES AUTÓNOMOS (v2.1)

**Arquitectura:** Sistema Experto determinista en cliente (TypeScript) con memoria transitoria en Zustand. Motores en `src/domain/logic/clinicalAgent.ts` y `purchasingAgent.ts`.

**Pila AI:** Inferencia por reglas (symbolic), matching semántico ligero para síntomas, edge computing sin dependencias server. Estado inyectado desde `cart`, `currentCustomer`, `inventory`.

### Agentes
* **ClinicalAgent (Copiloto Farmacéutico) – POS:**  
  * DDI Firewall: escanea `active_ingredients` al agregar ítems; bloquea combos de riesgo.  
  * Patient Match: cruza `healthTags` con metadatos; bloquea AINEs embarazo, pseudoefedrina en HTA, alerta jarabes con azúcar en diabetes.  
  * Upsell Ético: sugiere mitigadores (probióticos con antibióticos, B12 con metformina).  
  * UI: `ClinicalSidebar.tsx` (alertas tiempo real + búsqueda por síntoma), `DrugInteractionAlert.tsx` takeover de pantalla con PIN supervisor/QF para autorizar riesgo.
* **PurchasingAgent (Estratega SCM):**  
  * Trigger: on-demand en SupplyChain.  
  * Algoritmo: velocidad real de venta (últimos 30d) → cobertura 15d → brechas → orden `SUGGESTED`, agrupada por proveedor, considera stock actual + en tránsito.  
  * UI: tablero Kanban en `SupplyChainPage.tsx` y `StockAlertsPanel.tsx` (sensores temp/vencimientos).

### UI de Agentes
* `ClinicalSidebar.tsx`: tarjetas rojo/índigo con advertencias/oportunidades; input semántico (ej. “tos seca y dolor muscular”).
* `DrugInteractionAlert.tsx`: modal de bloqueo antes de confirmar producto; opciones cancelar o autorizar con PIN QF.
* `StockAlertsPanel.tsx`: alertas proactivas para gerencia (temperatura/vencimientos).

### Datos Enriquecidos
* `InventoryBatch`: requiere `active_ingredients: string[]`, `therapeutic_class`, `controlled_level`.  
* `ClinicalAnalysisResult`: `{ recommendation, warnings[], recommended_sku?, blocked_ingredients? }`.  
* `ClinicalSuggestion`: `{ type: 'WARNING'|'UPSELL'|'INFO', title, message, relatedProductId? }`.

**Nota Final:** Este documento debe actualizarse cada vez que se modifique la estructura de la base de datos o se agreguen nuevas reglas de negocio de alto nivel.
