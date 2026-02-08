---
name: observability-enforcer
description: Garantiza que el código sea depurable remotamente. Fuerza el uso de Sentry y logs estructurados en lugar de console.log.
---

# Observabilidad Obligatoria (Remote Debugging)

## Regla de Oro: "Si no está en Sentry, no ocurrió"

Al escribir bloques `try/catch` o manejar errores de API:

1.  **Prohibido Console:** No uses `console.log` o `console.error` para errores de negocio críticos.
2.  **Captura de Excepciones:**
    *   Usa `Sentry.captureException(error)` incluyendo contexto extra (Sucursal, UsuarioID, Versión App).
    *   Ejemplo obligatorio:
        ```typescript
        try {
          await processSale(cart);
        } catch (error) {
          Sentry.captureException(error, {
            tags: { module: 'POS', action: 'checkout' },
            extra: { cartSize: cart.length, total: cart.total }
          });
          // Mostrar UI amigable al usuario, no el stack trace
        }
        ```
3.  **Breadcrumbs:** Antes de acciones críticas (ej. "Click en Pagar"), inserta un `Sentry.addBreadcrumb` para poder reproducir los pasos del usuario antes del fallo.
