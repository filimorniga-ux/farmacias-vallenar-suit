
# ESCENARIO DE PRUEBA: Venta Mixta (Retail & Pharma)

Este escenario valida la lógica "Anti-Canela" y el comportamiento híbrido del POS.

**Objetivo:** Verificar que el sistema diferencie correctamente entre un medicamento (regulado, sin comisión) y un producto retail (libre, comisionable) en la misma transacción.

---

## Contexto
*   **Usuario:** Ana González (Cajera).
*   **Cliente:** Público General (Sin RUT).
*   **Productos a vender:**
    1.  `TAPSIN PERIODO` (Medicamento, Controlado, Sin Comisión).
    2.  `EUCERIN SUN FPS50` (Belleza, Retail, Con Comisión 3%).

---

## Paso a Paso

### 1. Escaneo de Medicamento
1.  Ana escanea/busca `TAPSIN`.
2.  **POS Check:** El sistema detecta `category: 'medicamento'`.
3.  **Clinical Agent:** Ejecuta validación de interacciones (DDI) si hay otros meds.
4.  **UI:** Se agrega a la lista con ícono de caja genérico (`PackageOpen`). No muestra indicador de comisión.

### 2. Escaneo de Producto Retail
1.  Ana escanea/busca `EUCERIN`.
2.  **POS Check:** El sistema detecta `category: 'BELLEZA'`.
3.  **Bypass:** El sistema **SALTA** la validación clínica estricta.
4.  **UI:**
    *   Se agrega a la lista mostrando la **Foto del Producto** (miniatura).
    *   Aparece un indicador verde `• $` (Comisionable).
    *   El panel inferior muestra: **"Tu ganancia estimada: +$480"** (3% de $15.990).

### 3. Comprobación de Cálculo (Anti-Canela)
1.  **Total Venta:** $3.990 (Tapsin) + $15.990 (Eucerin) = **$19.980**.
2.  **Lógica Interna (`calculateCommissions`):**
    *   Tapsin: $3.990 -> Excluido (Medicamento).
    *   Eucerin: $15.990 -> Incluido (Retail).
    *   Base Comisionable: **$15.990**.
    *   Comisión (3%): **$479**.
3.  *Error Común:* Si el sistema calculara sobre el total ($19.980), la comisión sería $599. El test es exitoso si muestra ~$480.

### 4. Finalización
1.  Pago con Efectivo.
2.  El sistema emite Boleta Electrónica.
3.  El stock se descuenta.
4.  En el reporte de nómina de fin de mes, se sumarán estos $480 a la liquidación de Ana.

---

## Resultado Esperado
La cajera se siente motivada al ver su ganancia en tiempo real solo por el producto de belleza, incentivando la venta de retail sin infringir la ley de fármacos sobre el medicamento.
