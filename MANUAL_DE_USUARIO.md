# 📘 Manual de Usuario Definitivo: Farmacias Vallenar Suite

**Versión:** 3.0 (Guía Paso a Paso)  
**Última Actualización:** Diciembre 2025  
**Objetivo:** Guía integral para operaciones diarias, desde la primera venta hasta el cierre financiero.

---

## 📑 Índice de Navegación

1.  [🚀 Introducción y Acceso al Sistema](#1-introducción-y-acceso-al-sistema)
2.  [🛒 Módulo POS (Para Cajeros y Vendedores)](#2-módulo-pos-para-cajeros-y-vendedores)
3.  [🏭 Inventario y Logística (Para Bodegueros)](#3-inventario-y-logística-para-bodegueros)
4.  [💰 Tesorería y Finanzas (Para Gerentes)](#4-tesorería-y-finanzas-para-gerentes)
5.  [👥 Administración y RRHH](#5-administración-y-rrhh)
6.  [❓ Solución de Problemas (Troubleshooting)](#6-solución-de-problemas-troubleshooting)

---

## 1. 🚀 Introducción y Acceso al Sistema

El sistema utiliza un **Selector de Contexto** inteligente para adaptar la experiencia a tu ubicación física.

### 📍 Paso 1: Selección de Contexto
Al encender el computador e ingresar al sistema, verás la pantalla: **"¿Dónde iniciarás turno hoy?"**.
*   **🏪 Sucursal:** Selecciona tu tienda (ej. "Vallenar Centro" o "Altiplano"). Aquí harás ventas.
*   **🏭 Bodega:** Selecciona si trabajarás gestionando stock y camiones.
*   **🏢 Casa Matriz:** Solo para gerencia central.

> 💡 **Nota:** Esta elección queda guardada. Si mañana vuelves al mismo PC, entrarás directo. Para cambiar, haz clic en el botón "Cambiar Contexto" en la pantalla de inicio.

### 🏠 Paso 2: El Hub Central
Una vez dentro, verás el **Hub de Aplicaciones**.
*   **🔵 Iniciar Sesión:** Tu herramienta de trabajo principal (ERP/POS).
*   **🌸 Reloj Control (Kiosco):** Para marcar entrada/salida de turno.
*   **🟣 Totem Filas:** Solo para pantallas de atención al cliente.

### 🔐 Paso 3: Login Seguro
1.  Haz clic en **"Iniciar Sesión"**.
2.  Busca tu nombre en la lista o escribe tu RUT.
3.  Ingresa tu **PIN de 4 dígitos**.
    *   *¿Olvidaste tu PIN?* Pídele al administrador que lo restablezca en el módulo de Usuarios.

---

## 2. 🛒 Módulo POS (Para Cajeros y Vendedores)

Guía completa para el flujo de venta.

### 🟢 Tutorial A: Apertura de Turno
Antes de vender, debes decirle al sistema con cuánto dinero empiezas.
1.  Ingresa al POS. El sistema te bloqueará y dirá **"Caja Cerrada"**.
2.  Haz clic en **"Abrir Caja"**.
3.  **Selecciona tu Terminal:** Ej. "Caja 1".
4.  **Monto Base:** Cuenta las monedas y billetes en tu cajón (sencillo) y escribe el total (ej. $20.000).
5.  Confirma. ¡Ya puedes vender!

### 🖥️ Anatomía de la Pantalla de Venta
*   **1. Barra Superior:** Buscador inteligente. Escribe "Paracetamol" o "Dolor de cabeza".
*   **2. Canasta (Izquierda):** Lista de productos a llevar.
    *   Usa los botones `+` y `-` para cambiar cantidades.
    *   Usa la papelera 🗑️ para quitar un error.
*   **3. Panel Financiero (Derecha):** Muestra el Total a Pagar.
    *   **Botón Cliente:** Asocia la venta a un RUT para dar factura o puntos.
    *   **Desc. Global:** Aplica un descuento a toda la compra (requiere clave de supervisor si es alto).

### 💳 Tutorial B: Procesar una Venta
1.  **Escanear:** Pasa el producto por el lector de código de barras.
2.  **Verificar:** Confirma que el producto apareció en la canasta con el precio correcto.
3.  **Cobrar:** Presiona la tecla `F9` o el botón **"Pagar"**.
4.  **Medio de Pago:**
    *   💵 **Efectivo:** Escribe cuánto te entrega el cliente. El sistema te dirá el **Vuelto**.
    *   💳 **Tarjeta:** Selecciona Débito o Crédito. Ingresa el código de autorización del voucher (opcional).
5.  **Finalizar:** Presiona "Confirmar Pago". La boleta saldrá automáticamente.

> **💡 Tip Pro:** Activa el interruptor **"Auto-Print"** arriba a la derecha para que la boleta salga sola sin preguntar.

### 🔄 Tutorial C: Cambio de Turno (Relevo)
Si te vas y entra otro compañero a la *misma caja*:
1.  Haz clic en tu nombre (arriba derecha) > **"Cerrar Caja / Turno"**.
2.  Selecciona **"Relevo de Cajero"**.
3.  **Arqueo Ciego:** El sistema te pedirá contar TODO el dinero. **No te dirá cuánto debería haber**. Cuenta y escribe la realidad.
4.  El sistema imprimirá un **Ticket de Traspaso**. Fírmalo y entrégaselo a tu compañero junto con el dinero base.

### 🏁 Tutorial D: Cierre Final del Día
1.  Sigue los mismos pasos del Relevo pero elige **"Cierre Final"**.
2.  El sistema generará una **Remesa**.
3.  Guarda todo el dinero (menos la base de mañana) en una bolsa de valores.
4.  Pega el ticket de cierre en la bolsa y entrégasela al Gerente.

---

## 3. 🏭 Inventario y Logística (Para Bodegueros)

### 📥 Operación WMS: Recepción de Mercadería
Cuando llega un camión de un proveedor:
1.  Ve a **Logística** > **Recepciones**.
2.  **Nueva Recepción**. Escanea la factura física o guía de despacho.
3.  **Ingreso de Productos:**
    *   Escanea cada caja.
    *   Ingresa: Cantidad, **Lote** (código de fábrica) y **Vencimiento**.
    *   *¡Crucial!* Si ingresas mal el vencimiento, el sistema podría vender productos vencidos o bloquear productos buenos.
4.  Haz clic en **"Finalizar Recepción"**. El stock se suma a la bodega inmediatamente.

### 📦 Catálogo y Stock
Ve a **Inventario** > **Catálogo**.
*   **Niveles de Stock:**
    *   **Físico:** Lo que realmente hay en estantería.
    *   **Disponible:** Físico menos lo que está "reservado" en carritos de compra activos.
*   **Lotes:** Haz clic en un producto para ver el detalle de sus lotes. El sistema siempre venderá primero el lote que vence antes (**FEFO**).

### 📤 Importación Masiva (CSV)
Para actualizar precios o crear muchos productos nuevos:
1.  Ve a **Inventario** > **Herramientas** > **Importador**.
2.  Descarga la **Plantilla CSV**.
3.  Llénala en Excel *sin cambiar los nombres de las columnas*.
4.  Guárdala como `.csv` y súbela.
5.  Revisa la vista previa y confirma.

---

## 4. 💰 Tesorería y Finanzas (Para Gerentes)

El ciclo del dinero en Farmacias Vallenar es estricto para evitar pérdidas.

### ⛓️ La Cadena de Custodia
El dinero pasa por 3 estados:
1.  **Pendiente:** El cajero cerró su caja, pero nadie ha verificado la plata.
2.  **En Bóveda:** El Gerente contó la bolsa del cajero y confirmó que coincide con el sistema.
3.  **Depositado:** El dinero salió de la tienda hacia el Banco.

### 🏦 Tutorial: Recepción de Remesas
1.  Ve a **Tesorería** > **Recepciones**.
2.  Verás las alertas de "Cajas Cerradas por Confirmar".
3.  Llama al cajero. Abre su bolsa.
4.  Cuenta el dinero.
5.  En el sistema, ingresa el monto real contado.
6.  Si hay diferencia, el sistema te pedirá justificación.
7.  Haz clic en **Correcto / Aceptar**. Ahora el dinero es tu responsabilidad.

### ⚖️ Dashboard Financiero
En la pantalla principal de Tesorería verás:
*   **Saldo en Caja Fuerte:** Dinero acumulado listo para depositar.
*   **Ventas del Día:** Total vendido (Efectivo + Tarjetas).
*   **Diferencias:** Gráfico de sobrantes/faltantes por cajero. Úsalo para feedback.

---

## 5. 👥 Administración y RRHH

### ⏱️ Control de Asistencia
1.  Ve a **RRHH** > **Asistencia**.
2.  Verás la lista de empleados.
3.  **Alertas:**
    *   🔴 **Rojo:** Llegada tarde (después de hora de contrato + tolerancia).
    *   🟡 **Amarillo:** Salida anticipada.
4.  Puedes exportar este reporte a Excel para la liquidación de sueldos.

### ⚙️ Configuración del Sistema
*   **Usuarios:** Crea nuevos empleados. Recuerda asignarles el **Rol** correcto (Cajero, Químico, Admin) y las **Sucursales** permitidas.
*   **Impresoras:**
    *   Instala el driver de tu impresora térmica (Epson, Star, XPrinter).
    *   En Configuración > Impresoras, selecciona si usas papel de 80mm o 58mm.
    *   Haz una "Prueba de Impresión" para ajustar márgenes.

---

## 6. ❓ Solución de Problemas (Troubleshooting)

### ☁️ Modo Offline (Sin Internet)
*   **Síntoma:** El icono de nube arriba se pone rojo.
*   **Acción:** **NO PARES DE VENDER.** El sistema está diseñado para funcionar sin internet. Guardará todo en el navegador.
*   **Recuperación:** Cuando vuelva internet, verás que el icono gira. Espera a que se ponga verde antes de cerrar tu turno o apagar el computador.

### 🖨️ La Impresora no funciona
1.  Revisa que tenga papel y esté encendida (luz verde fija, no parpadeando).
2.  Revisa el cable USB.
3.  En el sistema, apaga y vuelve a encender el interruptor "Auto-Print".
4.  Si nada funciona, reinicia el computador.

### 🚫 "Acceso Denegado" al entrar
*   Verifica que estás en la **Sucursal Correcta**. Un cajero de "Centro" no puede entrar en "Altiplano" a menos que tenga permiso.
*   Pide a tu jefe que revise tu perfil en "Usuarios" y marque las casillas de sucursal correspondientes.

---
> **Farmacias Vallenar Suite** - Tecnología que cuida.
