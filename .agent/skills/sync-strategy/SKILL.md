---
name: sync-conflict-resolver
description: Define la lógica de re-intento y resolución de conflictos para la sincronización Offline-Online. Se activa al crear workers, cronjobs o lógica de 'sync'.
---

# Estrategia de Sincronización y Conflictos

## Principio: "La Verdad está en el Servidor, pero el Negocio está en el Cliente"

Cuando generes lógica para sincronizar datos (`src/actions/sync.ts` o colas de Zustand):

1.  **Modelo de Cola (Queue Pattern):**
    *   Toda acción offline (Venta, Ajuste de Stock) debe entrar a una `MutationQueue` persistente en IndexedDB/LocalStorage.
    *   Nunca intentes enviar datos paralelos sin orden. Procesa la cola secuencialmente (FIFO).

2.  **Matriz de Resolución de Conflictos (Conflict Strategy):**
    *   **Inventario:** Si el stock del servidor es menor al local al sincronizar -> **Rechazar venta** y generar alerta "Stock agotado durante sync".
    *   **Precios:** Si el precio cambió mientras estaba offline -> **Respetar precio local** (el que vio el cliente) y marcar flag `price_override` para auditoría.
    *   **Clientes:** Si el cliente se editó en dos cajas -> **Merge inteligente** (actualizar campos vacíos, mantener últimos modificados).

3.  **Feedback Visual:**
    *   El código debe actualizar el estado de UI global: `isSyncing`, `syncError`, `itemsPending`.
