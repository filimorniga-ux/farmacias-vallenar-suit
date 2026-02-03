---
name: arquitecto-offline
description: Fuerza el cumplimiento de arquitectura Clean Architecture y patrón Offline-First. Evita llamadas API directas en UI y prioriza estado local.
---
# Arquitecto "Offline-First" (Clean Architecture Enforcer)

## Cuándo usar este skill
- Cuando el usuario pida crear o modificar componentes de lógica de negocio (inventario, ventas, stock).
- Cuando se detecte que hay requisitos de funcionamiento en zonas remotas o sin conexión.
- Cuando vayas a estructurar nuevos módulos del proyecto.
- **Siempre** que escribas código para `src/components`, `src/hooks`, o `src/actions`.

## Reglas Estrictas (Clean Architecture & Offline-First)

### 1. Regla de Persistencia (Zustand > API)
**NUNCA** hagas fetch directo en un componente UI.
- La "fuente de verdad" es el **estado local** (Zustand persistido en `localStorage`).
- **Flujo correcto**:
  1.  Componente llama a acción de Zustand (ej: `useInventoryStore.getState().decreaseStock()`).
  2.  Zustand actualiza UI **inmediatamente** (Optimistic UI).
  3.  Zustand persiste en local.
  4.  En segundo plano/deferido, Zustand intenta sincronizar con Backend (`src/actions/`).

### 2. Regla de Estructura de Archivos
Respeta la separación de responsabilidades:
-   **Lógica Pura (`src/domain/` o `src/logic/`)**: Cálculos de impuestos, algoritmos FEFO, validaciones. Sin React, sin BD.
-   **Conexión a Datos (`src/actions/`)**: Server Actions que hablan con la BD o APIs externas. Aquí reside el "riesgo de desconexión".
-   **Vista (`src/components/`)**: Solo renderiza datos. No calcula. No llama a APIs. Solo llama a Hooks/Lógica.

### 3. Regla de Tecnologías
-   **CSS**: Exclusivamente **Tailwind CSS v4**. No crear archivos `.css` o `.sass`.
-   **Base de Datos**: Compatible con **PostgreSQL (TimescaleDB)**. No esquemas NoSQL.

## Workflow de Razonamiento
Antes de escribir código, verifica:
1.  **¿Dónde estoy?** Si es UI, prohibido `fetch` o `axios`.
2.  **¿Contexto?** Zona minera/remota. Asume que **NO hay internet**.
3.  **¿Acción?**
    -   *Incorrecto*: "Llamar API para guardar venta".
    -   *Correcto*: "Guardar venta en store local y marcar flag `needsSync`".

## Output Esperado
- Código que usa Stores de Zustand para cualquier mutación de datos.
- Estructura de archivos separada (UI, Store, Server Action).
- Manejo de estado optimista en la interfaz.

## Ejemplo de Corrección Mental
*Mal*: "Voy a crear un `useEffect` que llame a `/api/stock` para ver si hay producto."
*Bien*: "Usaré el hook `useInventory()` que lee del caché local. Si el caché está vacío o expirado, el store decidirá si intenta refrescar en segundo plano, pero la UI no se bloquea."
