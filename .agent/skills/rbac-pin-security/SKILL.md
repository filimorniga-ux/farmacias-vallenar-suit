---
name: rbac-pin-security
description: Fuerza la implementación de roles (RBAC) y solicitud de PIN para operaciones sensibles. Prohíbe login con email/password y aplica jerarquía estricta.
---
# Guardián de Seguridad y Roles (RBAC & PIN Enforcer)

## Cuándo usar este skill
- Cuando crees nuevas pantallas de acceso o login.
- Cuando implementes botones o acciones que modifiquen inventario, precios o usuarios.
- Cuando crees nuevas rutas o páginas en la aplicación (`src/app/`).
- **Siempre** que toques lógica de permisos o autenticación.

## Reglas Estrictas de Seguridad

### 1. Regla de "Cero Email/Password"
**ADVERTENCIA**: Este proyecto **NO** usa autenticación clásica por correo.
-   El login debe ser siempre: **Selector de Sucursal** -> **Selección de Usuario** -> **Teclado Numérico (PIN 4 dígitos)**.
-   Cualquier intento de crear un formulario con `email` y `password` es una violación de las reglas de negocio.

### 2. Regla de Operaciones Sensibles (Trigger de PIN)
Antes de ejecutar una acción crítica, verifica si cumple los umbrales para solicitar PIN de autorización superior.

**Tabla de Umbrales:**
| Acción | Condición | Requisito |
| :--- | :--- | :--- |
| Ajuste de Stock | < 100 unidades | Permitido (Usuario actual) |
| Ajuste de Stock | > 100 unidades | **PIN de Supervisor** (OBLIGATORIO) |
| Descuento | > 10% | **PIN de Gerente** (OBLIGATORIO) |
| Eliminar Lote | Cualquiera | **PIN de Supervisor** |

*Implementación*: Envuelve la acción en un modal que solicite el PIN del rol superior antes de llamar a la función de modificación.

### 3. Regla de Protección de Rutas (Jerarquía)
Cualquier página nueva debe verificar el rol contra `src/domain/auth.ts`.
**Jerarquía de Roles:**
`GERENTE` > `MANAGER` > `ADMIN` > `CASHIER` > `WAREHOUSE`

-   Un usuario con rol inferior NUNCA debe poder acceder a una ruta de rol superior.
-   Ejemplo: `CASHIER` no entra a `/reports`.

## Workflow de Razonamiento
1.  **Identificar Riesgo**: "¿Esta acción modifica dinero o stock masivo?"
2.  **Verificar Umbral**: "Si descuenta 15%, supera el 10% permitido."
3.  **Aplicar Seguridad**: "No puedo ejecutar `applyDiscount()` directo. Debo abrir `<ManagerPinModal onConfirm={applyDiscount} />`."

## Output Esperado
- Componentes que implementan modales de PIN para acciones críticas.
- Rutas protegidas con Higher-Order Components (HOC) o Middleware de roles.
- Ausencia total de campos "email" en formularios de acceso.
