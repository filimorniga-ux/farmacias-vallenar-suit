---
name: input-behavior-chile
description: Aplica automáticamente formato de RUT chileno, moneda (CLP), prefijos telefónicos y corrige el bloqueo de inputs numéricos. Se activa al crear formularios, carritos de compra o editar perfiles.
---

# UX de Inputs Chilenos y Edición Fluida

## Objetivo
Garantizar que todos los campos de entrada de datos en la aplicación respeten los formatos locales de Chile y permitan una edición fluida sin bloquear al usuario (evitar el problema de "no puedo borrar el número").

## 1. Regla de "Edición Fluida" (Solución al Input Bloqueado)
**Contexto:** En React/Next.js, forzar un `value={number || 0}` impide que el usuario borre el campo completamente para escribir una nueva cifra.

**Instrucción Técnica:**
Al crear componentes de input numérico (cantidad, precio, stock):
1.  **Estado Intermedio:** El estado interno del input DEBE ser `string | number`.
2.  **Permitir Vacío:** Permite que el valor sea una cadena vacía `""` durante la edición. No lo conviertas a `0` inmediatamente en el evento `onChange`.
3.  **Validación Lazy:** Solo valida, formatea o rellena con ceros en el evento `onBlur` (cuando el usuario sale del campo) o al enviar el formulario.
4.  **Ejemplo de Patrón:**
    ```typescript
    // ✅ CORRECTO
    const handleChange = (e) => {
      const val = e.target.value;
      if (val === '') setInternalValue(''); // Permite borrar todo
      else if (!isNaN(Number(val))) setInternalValue(Number(val));
    };
    ```

## 2. Reglas de Formato Automático (Chile)

### A. RUT (Rol Único Tributario)
Cualquier campo llamado `rut`, `dni` o `run` debe implementar **auto-puntuación**:
- **Formato:** `XX.XXX.XXX-Y`
- **Lógica:** Eliminar cualquier caracter que no sea número o 'K', y luego aplicar puntos y guión automáticamente mientras el usuario escribe o al perder el foco (`onBlur`).
- **Validación:** Implementar siempre la validación del "Dígito Verificador" (Módulo 11).

### B. Moneda (Peso Chileno - CLP)
Cualquier campo de dinero (`price`, `total`, `cost`) debe usar separadores de miles:
- **Visual:** Usar `Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' })`.
- **Input:** El usuario escribe `10000`, el input muestra `$10.000`.
- **Persistencia:** Al guardar en base de datos o estado, SE DEBE limpiar el formato (guardar `10000` integer, nunca `$10.000` string).

### C. Teléfonos (+56)
Cualquier campo de contacto telefónico:
- **Auto-Prefijo:** Si el usuario ingresa 8 o 9 dígitos, anteponer automáticamente `+569` o `+56`.
- **Limpieza:** Al guardar, eliminar espacios y símbolos, dejando formato E.164 (ej: `+56912345678`).

## 3. Checklist de Implementación UI
Cuando generes código para el módulo `pos` (Punto de Venta) o `cart`:
- [ ] ¿El input de cantidad permite borrar el '1' y dejarlo vacío momentáneamente?
- [ ] ¿El total se actualiza visualmente con puntos (ej. $1.500)?
- [ ] ¿El RUT del cliente se formatea solo?
