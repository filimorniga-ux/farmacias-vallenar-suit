# 📘 Manual de Usuario Maestro: Farmacias Vallenar Suite

**Versión:** 2.0 (Expert Edition)  
**Última Actualización:** Diciembre 2025  
**Audiencia:** Cajeros, Químicos Farmacéuticos, Bodegueros, Administradores.

---

## 📑 Tabla de Contenidos

1.  [Introducción y Flujo de Acceso](#1-introducción-y-flujo-de-acceso)
2.  [🛒 POS: Anatomía y Operación Avanzada](#2-pos-anatomía-y-operación-avanzada)
3.  [🏭 Inventario Avanzado y Logística](#3-inventario-avanzado-y-logística)
4.  [💰 Gestión Financiera y Tesorería](#4-gestión-financiera-y-tesorería)
5.  [⚙️ Configuración y Administración del Sistema](#5-configuración-y-administración-del-sistema)
6.  [📊 Reportes de Inteligencia de Negocios (BI)](#6-reportes-de-inteligencia-de-negocios-bi)
7.  [👥 Recursos Humanos y Seguridad](#7-recursos-humanos-y-seguridad)
8.  [🚨 Procedimientos de Emergencia](#8-procedimientos-de-emergencia)

---

## 1. Introducción y Flujo de Acceso

El sistema opera bajo una arquitectura de **"Contexto Localizado"**. Esto significa que el terminal se adapta físicamente al lugar donde se encuentra.

### 📍 Selector de Contexto (Landing Page)
Al cargar el sistema (`/`), el "Portero Inteligente" determina si el terminal tiene una ubicación asignada. Si no, o si está en incógnito, pedirá: **"¿Dónde inicias turno hoy?"**.

**Opciones Disponibles:**
| Tipo | Icono | Función |
| :--- | :---: | :--- |
| **Sucursal (Store)** | 🏪 | Venta al público, cierre de caja. |
| **Bodega (Warehouse)** | 🏭 | Recepción de camiones, despachos, gestión de lotes. |
| **Casa Matriz (HQ)** | 🏢 | Administración central, reportes globales, tesorería mayor. |

> ⚠️ **Importante:** La elección se guarda en una cookie por 1 año. Para cambiar de sucursal, usa el botón "Cambiar" en la cabecera del Hub.

### 🔐 Autenticación
*   **Método:** PIN Numérico de 4 dígitos.
*   **Bloqueo:** Tras 3 intentos fallidos, el usuario se bloquea temporalmente.
*   **Permisos:** El sistema valida: `Usuario Existe` + `PIN Correcto` + `Usuario Asignado a ESTA Sucursal`.

---

## 2. 🛒 POS: Anatomía y Operación Avanzada

El Punto de Venta es el corazón transaccional.

### 🖥️ Anatomía de Pantalla

#### A. Barra Superior (Header)
*   **Buscador Universal (`/`):** Detecta nombre, SKU o principio activo.
    *   *Comando Rápido:* Presiona `/` para ir al buscador.
*   **Indicador de Red:** 🟢 Online / 🔴 Offline (Ventas se guardan localmente).
*   **Usuario:** Muestra quién está operando. Clic para Cerrar Sesión.

#### B. Panel Izquierdo (La Canasta)
Lista los ítems actuales.

| Columna | Descripción | Acción |
| :--- | :--- | :--- |
| **Producto** | Nombre y DCI. | Clic para ver ficha técnica. |
| **Cant.** | Unidades a vender. | `+` / `-` para ajustar. |
| **P. Unit** | Valor unitario. | --- |
| **Total** | Subtotal línea. | Botón 🗑️ para eliminar ítem. |

#### C. Panel Derecho (Resumen Financiero)
*   **Neto/IVA:** Desglose fiscal obligatorio.
*   **Acciones Rápidas:**
    *   `% Desc. Global`: Aplica un porcentaje a toda la boleta.
    *   `🔍 Consultar`: Verifica precio sin agregar a la venta.
    *   `👤 Cliente`: Asocia un RUT para puntos o facturas.

#### D. Botonera Inferior
*   **🟨 Pagar (`F9`):** Abre modal de pagos.
*   **🟦 Guardar (Hold):** Deja la venta en espera para atender a otro cliente.
*   **🟥 Cancelar:** Limpia toda la pantalla.

### 🧪 Procedimientos Específicos

#### 1. Aplicar Descuento a Producto Específico
1.  Haz clic en el precio del producto en la lista.
2.  Ingresa el nuevo precio o el % de descuento.
3.  Ingresa la razón (ej. "Producto próximo a vencer").
4.  Requiere autorización de Supervisor (PIN) si supera el límite configurado.

#### 2. Venta en Espera (Hold/Recuperar)
*   **Poner en Espera:** Pulsa "Guardar". Ingresa un nombre de referencia (ej. "Señora Cartera Roja").
*   **Recuperar:** Pulsa el botón "Recuperar Venta" (icono de reloj arriba). Selecciona la venta de la lista.

#### 3. Anular Venta (Nota de Crédito)
Solo permitida el mismo día.
1.  Menú Lateral > **Transacciones**.
2.  Busca la boleta.
3.  Clic en "Anular".
4.  Razón obligatoria. El stock vuelve al inventario automáticamente.

---

## 3. 🏭 Inventario Avanzado y Logística

### 🧬 Gestión de Lotes y FEFO
El sistema prioriza la salud pública usando **FEFO (First Expired, First Out)**.
*   **Al vender:** El sistema descuenta automáticamente del lote con vencimiento más próximo.
*   **Semáforo de Fechas:**
    *   🟢 > 6 meses.
    *   🟡 < 3 meses (Alerta de liquidación).
    *   🔴 Vencido (Bloqueado para venta).

### 🗂️ Kardex (Tarjeta de Existencia)
Herramienta de auditoría por excelencia.
1.  Ve a Ficha de Producto > Pestaña **"Movimientos"**.
2.  Verás cada entrada (+) y salida (-) cronológica.
    *   *Tipo:* Compra, Venta, Traspaso, Merma.
    *   *Usuario:* Quién hizo la acción.
    *   *Documento:* N° de Factura o Boleta asociada.

### ⚖️ Ajustes de Inventario
Para corregir diferencias físicas.
1.  Menú Lateral > **Inventario** > **Ajustes**.
2.  **Nuevo Ajuste**.
3.  Tipo:
    *   **Pérdida/Merma:** Resta stock (ej. Frasco roto).
    *   **Hallazgo:** Suma stock.
    *   **Vencimiento:** Saca de stock comercial y mueve a "Cuarentena".

---

## 4. 💰 Gestión Financiera y Tesorería

### ⛓️ La Cadena de Custodia
El objetivo es que **ningún peso se mueva sin un responsable**.

1.  **Cajero (Origen):**
    *   Cierra caja.
    *   El sistema genera un `cash_movement` tipo `REMITTANCE_TRANSIT`.
    *   Entrega sobre sellado. Estado: **PENDIENTE**.

2.  **Gerente (Verificación):**
    *   Menú Tesorería > Pestaña **"Recepciones"**.
    *   Escanea el código del sobre o selecciona la remesa.
    *   Cuenta el dinero frente al cajero.
    *   Clic en **"Confirmar Recepción"**. Estado: **EN BÓVEDA**.

3.  **Banco (Destino):**
    *   Selecciona las remesas a depositar (pueden ser varias).
    *   Clic en **"Registrar Depósito"**.
    *   Sube foto del comprobante bancario. Estado: **DEPOSITADO**.

---

## 5. ⚙️ Configuración y Administración del Sistema

### 👤 Usuarios y Roles
**Ruta:** Configuración > Usuarios.

Use los roles predefinidos para seguridad:
*   **Cashier:** Solo POS y Cierre propio.
*   **Warehouse:** Solo Inventario y Recepción.
*   **Pharmacist:** POS, Inventario, Validación de Recetas.
*   **Admin:** Acceso Total + Configuración.

**Crear Usuario:**
1.  Nuevo Empleado.
2.  Datos personales (RUT crítico para login).
3.  **Asignar Sucursales:** ¡Crucial! Marca las casillas donde puede operar.

### 🖨️ Impresoras
El sistema soporta protocolo ESC/POS (Epson Standard).
*   **Configuración:** Menú lateral > Configuración > **Impresoras**.
*   **Ancho de Papel:**
    *   `80mm`: Estándar supermercado (recomendado).
    *   `58mm`: Maquinitas portátiles.
*   **Silent Printing:** Habilítalo en el navegador (Chrome/Edge) para evitar el cuadro de diálogo de Windows.

### 🏢 Datos de Empresa
Para el encabezado de la boleta.
*   **Ruta:** Configuración > Organización.
*   Campos: Razón Social, RUT, Dirección Matriz, Logo (URL o subida).

---

## 6. 📊 Reportes de Inteligencia de Negocios (BI)

### 📈 Métricas del Dashboard

1.  **Margen Bruto:**
    *   *Fórmula:* `(Total Ventas - Costo Mercadería) / Total Ventas`
    *   Indica rentabilidad real. Meta ideal: > 30%.
2.  **Ticket Promedio:**
    *   *Fórmula:* `Total Ventas / N° Transacciones`
    *   Indica cuánto gasta cada cliente. Estrategia: Ofrecer agregados para subirlo.
3.  **Tasa de Conversión:** (Requiere contador de personas en puerta)
    *   `Ventas / Visitas Totales`.

### 📑 Pestañas de Reportes
*   **Ventas por Hora:** Mapa de calor. Útil para armar turnos de personal en horas pico.
*   **Top Productos:** Ranking Pareto (80/20). Cuida que estos NUNCA quiebren stock.
*   **Ventas por Vendedor:** Para cálculo de comisiones.

---

## 7. 👥 Recursos Humanos y Seguridad

### ⏰ Control de Asistencia
El módulo de Kiosco (`/kiosk`) alimenta este reporte.
*   **Reporte de Atrasos:** Filtra por `Hora Entrada > Hora Turno`.
*   **Horas Extras:** El sistema calcula automáticamente `Hora Salida Real - Hora Salida Turno`.

---

## 8. 🚨 Procedimientos de Emergencia

### 🧹 "El sistema está lento / Comportamiento errático"
Suele ser caché del navegador.
1.  Presiona `F12`.
2.  Ve a pestaña "Application" > "Storage".
3.  Clic en "Clear Site Data".
4.  Recarga con `Ctrl + F5`.
    *(Esto borra la preferencia de sucursal, tendrás que elegirla de nuevo).*

### ☁️ Error de Sincronización (Offline)
Si internet falla:
1.  El icono de nube se pone rojo/tachado.
2.  **NO cierres la pestaña del navegador.**
3.  Sigue vendiendo. Las ventas se guardan en `IndexedDB` (memoria del navegador).
4.  Al volver internet, el icono gira (sincronizando). Espera a que se ponga verde antes de cerrar turno.

### 🆘 "Pantalla Blanca" (Crash)
Si la pantalla se pone blanca o sale "Error de Servidor":
1.  Intenta volver a la raíz: borrra todo en la barra de dirección y deja solo el dominio (`/`).
2.  Si persiste, contacta a Soporte con una foto del error.

---

> **Farmacias Vallenar Suite**  
> *Manual de Referencia Técnica - Prohibida su reproducción sin autorización.*
