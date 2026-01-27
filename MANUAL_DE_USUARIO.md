# 📘 Manual de Usuario: Farmacias Vallenar Suite

**Versión:** 3.1 (Guía Actualizada)  
**Última Actualización:** 27 de Enero, 2026  
**Objetivo:** Guía integral para operaciones diarias, desde el primer acceso hasta el cierre financiero.

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

El sistema utiliza un **flujo de autenticación por sucursal y PIN**, diseñado para ser rápido y seguro en entornos de alto tráfico.

### 📍 Paso 1: Selección de Sucursal

Al abrir la aplicación (`http://localhost:3000`), verás la pantalla: **"¿Dónde inicias turno hoy?"**.

*   Selecciona tu sucursal haciendo clic en el botón **"Seleccionar"** de la tarjeta correspondiente.
*   Ejemplo: **"Farmacia Vallenar santiago"**

> 💡 **Nota:** Esta elección se recuerda. Si mañana vuelves al mismo equipo, puedes cambiar de sucursal desde el botón "Cambiar" en la esquina.

### 🏠 Paso 2: Selección de Módulo

Una vez seleccionada la sucursal, verás el **Hub de Módulos** con diferentes opciones:

| Módulo | Descripción | Roles |
|--------|-------------|-------|
| **Administración** | Dashboard gerencial, configuración | Gerentes, Admin |
| **Punto de Venta** | Ventas y caja | Cajeros, Vendedores |
| **Logística** | Inventario y bodega | Bodegueros |
| **Reloj Control** | Marcación de entrada/salida | Todos |

Haz clic en el botón **"ACCEDER"** del módulo que necesites.

### 🔐 Paso 3: Login con PIN

1.  Se abrirá el modal **"Iniciar Sesión"** con la lista de usuarios disponibles.
2.  **Busca tu nombre** en la lista o escribe para filtrar.
3.  **Haz clic** en tu nombre para seleccionarte.
4.  **Ingresa tu PIN de 4 dígitos** en el campo que aparece.
5.  Presiona el botón **"Entrar"**.

### 👤 Usuarios de Demostración

| Nombre | PIN | Rol | Acceso |
|--------|-----|-----|--------|
| Gerente General 1 | 1213 | Gerente | Acceso total |
| Cajero 1 | 1234 | Cajero | POS, Ventas |

> ⚠️ **¿Olvidaste tu PIN?** Pídele a un administrador que lo restablezca desde el módulo de Usuarios.

---

## 2. 🛒 Módulo POS (Para Cajeros y Vendedores)

Guía completa para el flujo de venta.

### 🟢 Tutorial A: Apertura de Turno

Antes de vender, debes declarar tu fondo de caja.

1.  Ingresa al **POS**. Si la caja está cerrada, verás el mensaje **"Caja Cerrada"**.
2.  Haz clic en **"Abrir Caja"**.
3.  **Selecciona tu Terminal:** Ej. "Caja 1".
4.  **Monto Base:** Cuenta el dinero en tu cajón (sencillo) y escribe el total (ej. $20.000).
5.  Confirma. ¡Ya puedes vender!

### 🖥️ Anatomía de la Pantalla de Venta

*   **1. Barra Superior:** Buscador inteligente. Escribe "Paracetamol" o "Dolor de cabeza".
*   **2. Canasta (Izquierda):** Lista de productos a llevar.
    *   Usa los botones `+` y `-` para cambiar cantidades.
    *   Usa la papelera 🗑️ para quitar un producto.
*   **3. Panel Financiero (Derecha):** Muestra el Total a Pagar.
    *   **Botón Cliente:** Asocia la venta a un RUT para dar factura o puntos.
    *   **Desc. Global:** Aplica un descuento (requiere PIN de supervisor si es alto).

### 💳 Tutorial B: Procesar una Venta

1.  **Escanear:** Pasa el producto por el lector de código de barras.
2.  **Verificar:** Confirma que el producto apareció con el precio correcto.
3.  **Cobrar:** Presiona `F9` o el botón **"Pagar"**.
4.  **Medio de Pago:**
    *   💵 **Efectivo:** Escribe cuánto entrega el cliente. El sistema calcula el **Vuelto**.
    *   💳 **Tarjeta:** Selecciona Débito o Crédito.
5.  **Finalizar:** Presiona "Confirmar Pago". La boleta sale automáticamente.

> **💡 Tip Pro:** Activa **"Auto-Print"** arriba a la derecha para imprimir automáticamente.

### 🔄 Tutorial C: Cambio de Turno (Relevo)

Si te vas y entra otro compañero a la *misma caja*:

1.  Haz clic en tu nombre (arriba derecha) > **"Cerrar Caja / Turno"**.
2.  Selecciona **"Relevo de Cajero"**.
3.  **Arqueo Ciego:** Cuenta TODO el dinero. El sistema no te dirá cuánto debería haber.
4.  El sistema imprimirá un **Ticket de Traspaso**. Fírmalo y entrégalo junto con el dinero.

### 🏁 Tutorial D: Cierre Final del Día

1.  Sigue los mismos pasos del Relevo pero elige **"Cierre Final"**.
2.  El sistema generará una **Remesa**.
3.  Guarda todo el dinero (menos la base de mañana) en una bolsa de valores.
4.  Pega el ticket de cierre en la bolsa y entrégala al Gerente.

---

## 3. 🏭 Inventario y Logística (Para Bodegueros)

### 📥 Operación WMS: Recepción de Mercadería

Cuando llega un camión de un proveedor:

1.  Ve a **Logística** > **Recepciones**.
2.  **Nueva Recepción**. Escanea la factura o guía de despacho.
3.  **Ingreso de Productos:**
    *   Escanea cada caja.
    *   Ingresa: Cantidad, **Lote** (código de fábrica) y **Vencimiento**.
    *   ⚠️ *¡Crucial!* Si ingresas mal el vencimiento, el sistema podría vender productos vencidos.
4.  Haz clic en **"Finalizar Recepción"**. El stock se suma inmediatamente.

### 📦 Ajuste de Stock

Para ajustar inventario (conteo físico, daños, etc.):

1.  Ve a **Logística** > **Inventario**.
2.  Busca el producto.
3.  Haz clic en **"Ajustar"**.
4.  Ingresa la cantidad a ajustar y el motivo.

> ⚠️ **Regla de Seguridad:** Ajustes de más de 100 unidades requieren **PIN de supervisor**.

### 🔄 Transferencias entre Ubicaciones

Para mover stock de una ubicación a otra:

1.  Busca el producto en **Inventario**.
2.  Haz clic en **"Transferir"**.
3.  Selecciona la **ubicación destino**.
4.  Ingresa la cantidad y confirma.

### 📦 Catálogo y Stock

*   **Stock Físico:** Lo que realmente hay en estantería.
*   **Stock Disponible:** Físico menos lo "reservado" en carritos activos.
*   **Lotes:** El sistema vende primero el lote que vence antes (**FEFO**).

---

## 4. 💰 Tesorería y Finanzas (Para Gerentes)

### ⛓️ La Cadena de Custodia

El dinero pasa por 3 estados:

1.  **Pendiente:** El cajero cerró su caja, nadie ha verificado.
2.  **En Bóveda:** El Gerente confirmó que coincide con el sistema.
3.  **Depositado:** El dinero salió hacia el Banco.

### 🏦 Tutorial: Recepción de Remesas

1.  Ve a **Tesorería** > **Recepciones**.
2.  Verás alertas de "Cajas Cerradas por Confirmar".
3.  Abre la bolsa del cajero y cuenta el dinero.
4.  Ingresa el monto real en el sistema.
5.  Si hay diferencia, el sistema pide justificación.
6.  Haz clic en **"Aceptar"**.

### ⚖️ Dashboard Financiero

*   **Saldo en Caja Fuerte:** Dinero listo para depositar.
*   **Ventas del Día:** Total (Efectivo + Tarjetas).
*   **Diferencias:** Gráfico de sobrantes/faltantes por cajero.

---

## 5. 👥 Administración y RRHH

### ⏱️ Control de Asistencia

1.  Ve a **RRHH** > **Asistencia**.
2.  **Alertas:**
    *   🔴 **Rojo:** Llegada tarde.
    *   🟡 **Amarillo:** Salida anticipada.
3.  Exporta a Excel para liquidación de sueldos.

### ⚙️ Configuración del Sistema

*   **Usuarios:** Crea empleados, asigna **Rol** (Cajero, Químico, Admin) y **Sucursales**.
*   **Impresoras:** Configura papel de 80mm o 58mm. Haz "Prueba de Impresión".

---

## 6. ❓ Solución de Problemas (Troubleshooting)

### ☁️ Modo Offline (Sin Internet)

*   **Síntoma:** El icono de nube se pone rojo.
*   **Acción:** **NO PARES DE VENDER.** El sistema está diseñado para funcionar offline.
*   **Recuperación:** Cuando vuelva internet, espera a que el icono esté verde antes de cerrar turno.

### 🖨️ La Impresora no funciona

1.  Revisa papel y cables.
2.  Apaga/enciende el interruptor "Auto-Print".
3.  Reinicia el computador si es necesario.

### 🚫 "Acceso Denegado"

*   Verifica que estás en la **Sucursal Correcta**.
*   Pide que revisen tu perfil en "Usuarios" y marquen las casillas de sucursal.

### 🔐 PIN Incorrecto

*   Verifica que estás ingresando el PIN correcto (4 dígitos).
*   Si olvidaste tu PIN, contacta al administrador.
*   Después de varios intentos fallidos, tu cuenta puede bloquearse temporalmente.

### 🔄 Error: "input[name='username'] not found"

*   Este error aparece en tests E2E antiguos.
*   El sistema NO usa formulario de email/password.
*   El login es por **sucursal + usuario + PIN**.

---

> **Farmacias Vallenar Suite** - Tecnología que cuida. 💊
