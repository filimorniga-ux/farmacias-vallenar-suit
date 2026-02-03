---
name: qa-testing-enforcer
description: Garantiza que todo código nuevo tenga tests asociados usando Vitest o Playwright. Se activa cuando el usuario pide crear funciones, componentes o corregir bugs.
---

# QA & Testing Standard (Farmacias Vallenar)

## Objetivo
Mantener la integridad del ERP de misión crítica asegurando que cada nueva pieza de lógica tenga cobertura de tests automática. Está prohibido generar código de negocio sin su contraparte de prueba.

## Reglas de Decisión (Unitario vs E2E)

Antes de escribir el test, analiza qué estás modificando:

1.  **¿Es Lógica de Negocio Pura?** (Ej: cálculos de impuestos, validación de RUT, reglas de stock FEFO).
    *   **Acción:** Crea un **Test Unitario** en `tests/actions/` o `tests/domain/`.
    *   **Herramienta:** `Vitest`.
    *   **Requisito:** DEBES usar Mocks para la base de datos. No toques la DB real en tests unitarios.

2.  **¿Es un Flujo Crítico de Usuario?** (Ej: Cajero cierra una venta, Bodeguero rechaza un pedido).
    *   **Acción:** Crea un **Test E2E** en `tests/e2e/`.
    *   **Herramienta:** `Playwright`.
    *   **Requisito:** Usa el helper de login existente: `import { loginAsManager } from './helpers/login'`.

## Instrucciones de Generación

1.  **Estructura Espejo**: Si creas `src/actions/inventory.ts`, debes crear o actualizar `tests/actions/inventory.test.ts`.
2.  **Patrón AAA**: Escribe los tests siguiendo el patrón "Arrange, Act, Assert".
3.  **Manejo de Errores**: No pruebes solo el "camino feliz". Debes escribir un test case para cuando la operación falla (ej. "Stock insuficiente lanza error").

## Restricciones (Constraints)

- **PROHIBIDO** usar `any` en los tests. Define los tipos de TypeScript correctamente.
- **PROHIBIDO** comentar tests que fallan para que pasen. Si falla, arregla el código.
- **PROHIBIDO** hacer `console.log` dentro de los tests.

## Ejemplo de Uso

**Input del Usuario:** "Crea una función para calcular el descuento de tercera edad."

**Output del Agente:**
1. Genera `src/domain/discounts.ts` con la lógica.
2. Genera automáticamente `tests/domain/discounts.test.ts` con casos para:
   - Edad < 60 (Sin descuento)
   - Edad > 60 (Con descuento)
   - Edad inválida (Error)
