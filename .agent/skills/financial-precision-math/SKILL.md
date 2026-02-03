---
name: financial-precision-math
description: Protege la integridad de los cálculos monetarios. Se activa siempre que se detecten operaciones de precios, impuestos, caja, nómina o inventario valorizado.
---

# Precisión Financiera (No Floating Point)

## Alerta de Seguridad
Este sistema gestiona dinero real. El uso de aritmética de punto flotante (`float`, `double`) para cálculos monetarios está **ESTRICTAMENTE PROHIBIDO** debido a errores de precisión IEEE 754.

## Instrucciones Técnicas

1.  **Almacenamiento y Cálculo (Backend/Logic)**:
    *   Todos los montos deben tratarse como **Enteros (Integers)**.
    *   *Regla de Oro*: Si el valor es $1.500 CLP, trátalo como `1500`. Si hubiera centavos (ej. UF), multiplica por 100 o 1000 antes de operar.
    *   Nunca uses `number` en TypeScript para dinero sin validación previa; prefiere tipos personalizados o `BigInt` si los montos exceden el límite seguro de JS.

2.  **Base de Datos (PostgreSQL)**:
    *   Al definir esquemas SQL, usa siempre el tipo `INTEGER` o `BIGINT` para columnas de dinero.
    *   **NUNCA** uses tipos `REAL`, `FLOAT` o `MONEY` (el tipo money de Postgres es problemático para migraciones).

3.  **Visualización (Frontend)**:
    *   Solo convierte a formato legible (con signos $ y puntos) en el último paso posible: dentro del componente React (`src/components/...`).
    *   Usa `Intl.NumberFormat('es-CL', ...)` para el formateo visual.

## Checklist de Verificación de Código

Antes de confirmar cualquier código que toque `src/actions/quotes-v2.ts` o `src/logic/sales.ts`, verifica:

- [ ] ¿Hay alguna división `/` que pueda generar decimales infinitos? -> Usa librerías de redondeo seguro.
- [ ] ¿Estás sumando `0.1 + 0.2`? -> **ERROR**. Convierte a enteros primero.
- [ ] ¿El total del carrito coincide exactamente con la suma de las líneas?

## Ejemplo Correcto vs Incorrecto

**❌ INCORRECTO (Rechazar):**
```typescript
const total = price * 1.19; // Riesgo de decimales flotantes
return total;
```

**✅ CORRECTO (Aprobar):**
```typescript
// Trabajando con enteros, redondeando al final
const net = 1000;
const taxRate = 19; // 19%
const total = Math.round(net * (1 + taxRate / 100)); 
// O mejor aún, usando librerías de utilidades si existen en src/lib/
```
