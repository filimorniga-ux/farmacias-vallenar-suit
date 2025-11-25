# Farmacias Vallenar Suit (Pharma-Synapse)

**Versión:** 2.1 (Agentic Era)  
**Rol:** ERP Farmacéutico de Misión Crítica  
**Target:** Farmacias de alto volumen en zonas remotas/mineras (Chile)

---

## 🚀 Estado Actual del Proyecto

### ✅ **Componentes Implementados**

#### **Arquitectura Base**
- ✅ Estructura Clean Architecture (Domain, Infrastructure, Presentation)
- ✅ TypeScript con tipos estrictos
- ✅ Zustand Store con persistencia local (Offline-First)
- ✅ React 18 + Vite
- ✅ Tailwind CSS v4
- ✅ React Router v7

#### **Módulos Operativos**
- ✅ **Landing Page** - Selector de roles con diseño premium
- ✅ **POS (Punto de Venta)** - Sistema de carrito y ventas básico
- ✅ **Inventario** - Visualización de lotes con trazabilidad FEFO
- ✅ **Navegación** - Sidebar con RBAC (Role-Based Access Control)

#### **Lógica de Negocio**
- ✅ **Anti-Canela** - Compliance legal para comisiones
- ✅ **Clinical Logic** - Motor de interacciones farmacológicas (DDI)
- ✅ **FEFO** - First Expired, First Out (vencimientos)

#### **Datos de Demostración**
- ✅ 3 usuarios (Manager, Cajero, Bodeguero)
- ✅ 7 productos farmacéuticos (medicamentos + retail)
- ✅ Lotes de inventario con vencimientos
- ✅ Ubicación predeterminada (Farmacia Central Vallenar)

---

## 📦 Instalación y Ejecución

### **Requisitos Previos**
- Node.js 18+ (recomendado: 20+)
- npm

### **Iniciar Desarrollo**

```bash
# Instalar dependencias (ya ejecutado)
npm install

# Modo desarrollo
npm run dev

# Build producción
npm run build

# Preview producción
npm preview
```

### **Acceso a la Aplicación**

**URL:** `http://localhost:5173`

**Usuarios de Demostración:**

| Rol | Usuario | PIN | Funcionalidad |
|-----|---------|-----|---------------|
| **Manager** | admin | 1234 | Acceso total (Dashboard, Analytics, Seguridad) |
| **Cajero** | cajero1 | 5678 | Punto de Venta, Ventas |
| **Bodeguero** | bodega1 | 9012 | Inventario, Logística |

---

## 🏗️ Arquitectura del Proyecto

```
src/
├── domain/                      # Lógica de Negocio Pura
│   ├── logic/
│   │   ├── clinical.ts          # Interacciones farmacológicas
│   │   └── compliance.ts        # Anti-Canela, reglas legales
│   └── types.ts                 # Interfaces TypeScript maestras
│
├── infrastructure/              # I/O y Servicios Externos
│   └── printer/                 # (Futuro: Generación PDFs)
│
├── presentation/                # Capa de UI (React)
│   ├── components/
│   │   └── pos/
│   │       └── POSMainScreen.tsx
│   ├── layouts/
│   │   └── SidebarLayout.tsx    # Navegación principal
│   ├── pages/
│   │   ├── LandingPage.tsx      # Selector de roles
│   │   ├── POSPage.tsx          # Punto de venta
│   │   └── InventoryPage.tsx    # Gestión de inventario
│   └── store/
│       └── useStore.ts          # Estado global Zustand
│
└── utils/                       # Helpers generales
```

---

## 🎯 Próximos Pasos (Roadmap)

### **Prioridad Alta**
- [ ] Dashboard gerencial con KPIs
- [ ] Módulo de RR.HH. (Reloj Control, Nóminas)
- [ ] Analytics/Reportes (BI)
- [ ] Gestión de usuarios (Seguridad)

### **Prioridad Media**
- [ ] Clinical Sidebar (Chatbot IA)
- [ ] Supply Chain (Kanban de compras)
- [ ] Auditoría (Libro de Controlados)
- [ ] CRM/Fidelización

### **Prioridad Baja**
- [ ] Impresión de tickets térmicos
- [ ] Generación de DTE (Boletas electrónicas SII)
- [ ] Multi-tienda (sincronización)

---

## 🔧 Stack Tecnológico

| Categoría | Tecnología |
|-----------|-----------|
| **Framework** | React 18 + Vite 7 |
| **Lenguaje** | TypeScript 5.9 |
| **Estilos** | Tailwind CSS v4 |
| **Router** | React Router v7 |
| **Estado** | Zustand 5 (con persistencia) |
| **UI/UX** | Lucide React (iconos), Sonner (toasts), Framer Motion |
| **Utils** | date-fns, clsx, tailwind-merge |
| **Reportes** | jsPDF, jsPDF-autotable |

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
// Jerarquía: MANAGER > ADMIN > CASHIER > WAREHOUSE
// Validación de rutas por rol
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

---

## 📄 Licencia

Proyecto privado - Farmacias Vallenar © 2025

---

## 👨‍💻 Desarrollo

**Framework:** React + Vite  
**Arquitectura:** Clean Architecture (DDD-lite)  
**Patrón:** Offline-First con Zustand  
**Compliance:** Chile (ISP/SII/DT)

---

## 🌐 Servidor en Ejecución

El servidor de desarrollo está corriendo en: **http://localhost:5173**

Para detener: `Ctrl + C` en la terminal
