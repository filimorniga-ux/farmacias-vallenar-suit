
# SIMULACIÓN DE STRESS (PROOF OF CONCEPT) - Farmacias Vallenar Suit v2.1

Este script narra el flujo completo de validación que integra los 4 módulos críticos implementados: **Clinical Agent**, **DTE Engine**, **Loyalty System** y **Store Logic**.

---

## ESCENARIO: "El Caso de la Sra. Marta"

**Contexto:**
*   **Cliente:** Sra. Marta (RUT: 11.111.111-1).
*   **Perfil Clínico:** Etiquetada como `Hipertenso` y `Tercera Edad`.
*   **Saldo Puntos:** 5.000 Puntos acumulados.
*   **Ubicación:** Sucursal Centro, Caja 1.

---

### PASO 1: Identificación y Perfilado (CRM)
1.  El cajero presiona **F6** o la pestaña **CRM** en el POS.
2.  Busca "11111111-1".
3.  El sistema carga el perfil de Marta.
4.  **Validación Visual:** Aparecen los tags `Hipertenso` y `Tercera Edad` en rojo/púrpura.
5.  **Validación Fidelización:** Aparece el badge "💎 5.000 Puntos Vallenar" en el sidebar.

### PASO 2: Intervención Clínica (Clinical Agent)
1.  Marta dice: *"Me duele mucho la cabeza y tengo congestión, deme un Tapsin Periodo o algo fuerte"*.
2.  El cajero busca "TAPSIN PERIODO" (que contiene Cafeína) o intenta agregar un antigripal con Pseudoefedrina.
3.  **TRIGGER IA:** Al seleccionar el producto, el `ClinicalAgent.analyzeSymptom` cruza los ingredientes con el tag `Hipertenso`.
4.  **BLOQUEO:** El sistema muestra un Toast/Alerta Roja: *"BLOQUEO CLÍNICO: Paciente Hipertenso. Pseudoefedrina/Cafeína pueden elevar presión arterial."*
5.  **Recomendación:** El sistema sugiere verbalmente al cajero: *"Preferir Paracetamol solo o Tapsin Sin Descongestionante."*

### PASO 3: Venta Segura & Carrito
1.  El cajero hace caso a la IA y selecciona **PARACETAMOL 500MG** (x2 cajas).
2.  Precio Unitario: $1.500. Total: $3.000.
3.  Adicionalmente, Marta lleva una **Crema Eucerin** ($12.000).
4.  **Total Bruto Carrito:** $15.000.

### PASO 4: Canje de Puntos (Loyalty)
1.  Marta pregunta si puede usar sus puntos.
2.  El cajero ve el botón habilitado en el sidebar: **"Canjear Puntos (Max $5.000)"**.
3.  Clic en Canjear.
4.  **Acción Store:** `redeemPoints(5000)` se ejecuta.
5.  **UI Update:** El total a pagar baja a **$10.000**. Aparece una línea "Desc. Puntos: -$5.000".

### PASO 5: Cierre y Compliance (DTE)
1.  El cajero presiona **[F9] PAGAR**.
2.  Selecciona **Efectivo**. Ingresa $10.000.
3.  **Confirmar.**
4.  **Motor SII (`generateDTEPayload`):**
    *   Calcula Neto sobre el monto pagado real ($10.000 / 1.19 = $8.403).
    *   Calcula IVA ($1.597).
    *   Genera JSON DTE Tipo 33 (Si Marta pide Factura) o 39 (Boleta).
5.  **Finalización:**
    *   Se imprime el ticket.
    *   El stock se descuenta.
    *   **Recálculo Puntos:** Marta gastó $10.000 efectivo. Gana el 1% ($100 puntos nuevos).
    *   Saldo Final Puntos Marta: 0 (usados) + 100 (ganados) = **100 Puntos**.

---

## RESULTADO ESPERADO
El sistema debe haber bloqueado la venta peligrosa, aplicado el descuento correctamente, generado los impuestos sobre el monto real transaccionado y actualizado el saldo de puntos del cliente sin errores de consistencia.
