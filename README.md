# Farmacias Vallenar Suit (Pharma-Synapse)

**Versión:** 2.1 (Agentic Era)  
**Rol:** ERP Farmacéutico de Misión Crítica  
**Target:** Farmacias de alto volumen en zonas remotas/mineras (Chile)  
**Última Actualización:** 27 de Enero, 2026

---

## 🚀 Estado Actual del Proyecto

### ✅ **Componentes Implementados**

#### **Arquitectura Base**

- ✅ Estructura Clean Architecture (Domain, Infrastructure, Presentation)
- ✅ Next.js 15 con App Router
- ✅ TypeScript con tipos estrictos
- ✅ Zustand Store con persistencia local (Offline-First)
- ✅ Tailwind CSS v4
- ✅ PostgreSQL (TimescaleDB) para datos transaccionales

#### **Módulos Operativos**

- ✅ **Landing Page** - Selector de sucursal con diseño premium
- ✅ **POS (Punto de Venta)** - Sistema completo de ventas con carrito
- ✅ **Inventario** - Visualización de lotes con trazabilidad FEFO
- ✅ **Logística/WMS** - Gestión de stock y transferencias
- ✅ **Tesorería** - Control de caja y arqueos
- ✅ **RR.HH.** - Control de asistencia y nóminas
- ✅ **Analytics/BI** - Dashboard gerencial con KPIs

#### **Lógica de Negocio**

- ✅ **Anti-Canela** - Compliance legal para comisiones
- ✅ **Clinical Logic** - Motor de interacciones farmacológicas (DDI)
- ✅ **FEFO** - First Expired, First Out (vencimientos)
- ✅ **RBAC** - Control de acceso basado en roles

#### **Testing**

- ✅ **339+ tests unitarios** pasando (Vitest)
- ✅ **65 tests de hooks** pasando
- ✅ **Tests E2E** con Playwright
- ✅ Cobertura de módulos críticos (inventario, usuarios, cotizaciones)

---

## 📦 Instalación y Ejecución

### **Requisitos Previos**

- Node.js 18+ (recomendado: 20+)
- npm o pnpm
- PostgreSQL (opcional para desarrollo local con mocks)

### **Iniciar Desarrollo**

```bash
# Instalar dependencias
npm install

# Modo desarrollo
npm run dev

# Preview producción
npm run start
```

### **Despliegue Híbrido (Vercel & DigitalOcean)**

El proyecto está diseñado para ser **Agnóstico de Plataforma**:

- **Vercel**: Ideal para desarrollo, CI/CD de ramas y despliegues rápidos.
- **DigitalOcean App Platform (Docker)**: Recomendado para producción de alto volumen (sucursales físicas) para optimizar costos de ancho de banda y usuarios.

```bash
# Construir imagen Docker localmente (Simulación DO)
docker build -t farmacia-vallenar-suit .

# Ejecutar contenedor
docker run -p 3000:3000 farmacia-vallenar-suit
```

### **Ejecutar Tests**

```bash
# Tests unitarios (con mocks, sin DB real)
npm test

# Tests con cobertura
npm run test:coverage

# Tests E2E (requiere servidor corriendo)
npm run dev  # en una terminal
npx playwright test  # en otra terminal

# Tests E2E con navegador visible
npx playwright test --headed
```

> **Nota:** Los tests unitarios usan mocks definidos en los archivos de test.  
> Los tests de integración se saltan automáticamente si no hay `POSTGRES_URL` configurado.

---

## 🔐 Acceso a la Aplicación

**URL Desarrollo:** `http://localhost:3000`

### **Flujo de Login (IMPORTANTE)**

El sistema utiliza un flujo de autenticación por **sucursal y PIN**, no un formulario email/password tradicional:

1. **Seleccionar Sucursal**: Ej. "Farmacia Vallenar Santiago"
2. **Click en ACCEDER**: En el módulo deseado (Administración, Punto de Venta, etc.)
3. **Seleccionar Usuario**: De la lista disponible
4. **Ingresar PIN**: Código de 4 dígitos

### **Usuarios de Demostración**

| Rol | Usuario | PIN | Acceso |
| ----- | --------- | ----- | -------- |
| **Gerente General** | Gerente General 1 | 1213 | Acceso total (Dashboard, Analytics, Seguridad) |
| **Cajero** | Cajero 1 | 1234 | Punto de Venta, Ventas |
| **Bodeguero** | Bodeguero 1 | (ver config) | Inventario, Logística |

---

## 🏗️ Arquitectura del Proyecto

```text
src/
├── actions/                     # Server Actions (Next.js)
│   ├── inventory-v2.ts          # Operaciones de inventario
│   ├── users-v2.ts              # Gestión de usuarios
│   ├── quotes-v2.ts             # Cotizaciones
│   └── ...
│
├── app/                         # App Router (Next.js 15)
│   ├── page.tsx                 # Selector de sucursal
│   ├── dashboard/               # Dashboard principal
│   ├── logistica/               # Módulo de inventario
│   ├── caja/                    # Módulo POS
│   └── ...
│
├── components/                  # Componentes React
│   ├── pos/                     # Componentes del POS
│   ├── inventory/               # Componentes de inventario
│   └── ui/                      # Componentes base (shadcn)
│
├── hooks/                       # Custom Hooks
│   ├── useProductSearch.ts      # Búsqueda de productos
│   ├── useCheckout.ts           # Flujo de checkout
│   └── ...
│
├── lib/                         # Utilidades y configuración
│   ├── db.ts                    # Conexión PostgreSQL
│   └── ...
│
└── domain/                      # Lógica de Negocio
    └── logic/
        ├── clinical.ts          # Interacciones farmacológicas
        └── compliance.ts        # Anti-Canela, reglas legales

tests/
├── actions/                     # Tests unitarios de actions
├── hooks/                       # Tests de hooks
├── integration/                 # Tests de integración (requieren DB)
└── e2e/                         # Tests E2E (Playwright)
    └── helpers/
        └── login.ts             # Helper de login reutilizable
```

---

## 🧪 Testing

### **Estructura de Tests**

| Tipo | Ubicación | Framework | Estado |
| ------ | ----------- | ----------- | -------- |
| Unitarios | `tests/actions/` | Vitest | ✅ 339+ pasando |
| Hooks | `tests/hooks/` | Vitest | ✅ 65 pasando |
| Integración | `tests/integration/` | Vitest | ⏭️ Requieren DB |
| E2E | `tests/e2e/` | Playwright | ✅ Corregidos |

### **Helper de Login para E2E**

Los tests E2E usan un helper compartido en `tests/e2e/helpers/login.ts`:

```typescript
import { loginAsManager } from './helpers/login';

test.beforeEach(async ({ page }) => {
    await loginAsManager(page);
});
```

---

## 📋 Reglas de Negocio Implementadas

### **1. Anti-Canela (Compliance Legal)**

```typescript
// Solo productos marcados como allows_commission: true generan comisiones
// Medicamentos y dispositivos médicos NO comisionan por ley
```

### **2. Trazabilidad FEFO**

```typescript
// El sistema ordena lotes por fecha de vencimiento ascendente
// Descuenta stock del lote más próximo a vencer
```

### **3. RBAC (Control de Acceso)**

```typescript
// Jerarquía: GERENTE > MANAGER > ADMIN > CASHIER > WAREHOUSE
// Validación de rutas y operaciones por rol
```

### **4. Umbrales de PIN para Operaciones Sensibles**

```typescript
// Ajuste de stock < 100 unidades: Sin PIN
// Ajuste de stock > 100 unidades: Requiere PIN de supervisor
// Descuentos > 10%: Requieren autorización
```

---

## 🐛 Debugging

### **Limpiar almacenamiento local**

```javascript
// Consola del navegador
localStorage.clear()
location.reload()
```

### **Ver estado de Zustand**

```javascript
// La persistencia guarda en localStorage con clave:
localStorage.getItem('farmacias-vallenar-storage')
```

### **Logs del servidor**

```bash
# Ver logs de desarrollo
npm run dev

# Los errores se muestran en la terminal con contexto
```

---

## 📄 Documentación Adicional

| Documento | Descripción |
| ----------- | ------------- |
| `FINAL_DOCUMENTATION.md` | Documentación técnica completa de todos los módulos |
| `INFORME_EJECUTIVO_ARQUITECTURA.md` | Arquitectura de datos y pipelines |
| `MANUAL_DE_USUARIO.md` | Guía paso a paso para operadores |
| `PROJECT_BIBLE.md` | Decisiones de arquitectura y convenciones |
| `digitalocean-staging.md` | Guía de despliegue containerizado en DigitalOcean ([docs/deploy/digitalocean-staging.md](docs/deploy/digitalocean-staging.md)) |

---

## 📄 Licencia

Proyecto privado - Farmacias Vallenar © 2025-2026

---

## 👨‍💻 Desarrollo

**Framework:** Next.js 15 (App Router)  
**Arquitectura:** Clean Architecture (DDD-lite)  
**Patrón:** Offline-First con Zustand  
**Testing:** Vitest + Playwright  
**Compliance:** Chile (ISP/SII/DT)
