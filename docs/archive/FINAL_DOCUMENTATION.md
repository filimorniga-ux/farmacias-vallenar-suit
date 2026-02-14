Aquí está la versión mejorada y adaptada de tu informe técnico para el Módulo POS y Finanzas de Farmacias Vallenar Suit.

He reorganizado la información para darle un tono más profesional y estratégico, y he profundizado en la lógica de "Cash Flow Control" (Control de Flujo de Caja), que es crucial para la rentabilidad del negocio.

Módulo de Punto de Venta (POS), Control de Caja y Finanzas - Recorrido de Implementación
Versión: 2.1 (Agentic Era) | Rol: Corazón Transaccional

Este documento detalla la arquitectura técnica del ecosistema de ventas y finanzas, diseñado para maximizar la velocidad de atención, garantizar la seguridad del efectivo y asegurar el cumplimiento tributario chileno.

1. Pila Tecnológica (Stack Específico del POS)
Gestión de Estado: Zustand. Manejo atómico y reactivo del carrito de compras, sesión de caja y totales financieros, asegurando persistencia ante recargas.

Interacción: Eventos de Teclado Globales. Listeners optimizados para atajos de teclado (F2 Buscar, F4 Convenio, F9 Pagar), permitiendo una operación "sin mouse" para cajeros expertos.

Hardware: Integración nativa con Lectores de Código de Barras (input rápido) y Teclados Virtuales (soporte Touch).

Persistencia: Estrategia Offline-First (localStorage) para garantizar la continuidad operativa ante caídas de red.

Salida: Generación de Tickets Térmicos (80mm) y Reportes PDF (A4) mediante PrinterService.

2. Reglas de Negocio Críticas ("Hard Rules")
A. Motor Tributario SII (DTE Engine)

Ubicación: src/domain/logic/sii_dte.ts

Lógica: Implementa ingeniería inversa tributaria para desglosar el IVA incluido en el precio retail chileno:

Neto = Math.round(Total Bruto / 1.19)

IVA = Total Bruto - Neto

Output: Genera un payload JSON (DTEPayload) estructurado según el estándar del SII para Boletas Electrónicas (Tipo 39) y Facturas (Tipo 33).

B. Control de Caja Ciego (Blind Balancing)

Ubicación: CashSummaryModal.tsx y ZReportModal.tsx

Mecanismo: El sistema mantiene un "Ledger Oculto" del efectivo teórico (Fondo Apertura + Ventas Efectivo - Egresos).

Seguridad: La interfaz permite ocultar los montos esperados, obligando al cajero a realizar un conteo físico ciego. El sistema valida la cuadratura (Sobrante/Faltante) solo después del ingreso manual.

C. Gestión de Egresos y Tesorería

Ubicación: CashMovementModal.tsx

Funcionalidad: Permite registrar salidas de dinero de la caja con trazabilidad total.

Gastos Operativos: Categorizados (Aseo, Insumos, Fletes).

Adelantos de Sueldo: Vinculación directa con el módulo de RR.HH.

Validación Biométrica: Para otorgar un adelanto, el sistema exige el PIN del Empleado Beneficiario, actuando como firma digital y autorizando el descuento automático en la liquidación de sueldo.

D. Compliance "Anti-Canela" (Ley de Fármacos II)

Mecanismo: Panel de Incentivos en tiempo real.

Lógica: El motor de comisiones filtra automáticamente cualquier producto categorizado como medicamento o insumo_medico. Solo calcula incentivos (ej. 3%) sobre productos marcados explícitamente como allows_commission: true (Belleza, Retail), protegiendo a la farmacia de multas laborales.

E. Convenios Corporativos (Crédito Empresa)

Ubicación: CorporateCreditModal.tsx

Flujo: Validación de identidad mediante escaneo de Cédula -> Consulta de saldo disponible -> Cargo a cuenta corriente de la empresa (ej. Mineras), eliminando el uso de efectivo.

3. Arquitectura de Componentes
Módulo Principal: POSMainScreen.tsx Diseño "Glass UI" optimizado en 3 columnas:

Catálogo Inteligente (Izquierda): Buscador omnibox con filtros FEFO y visualización de stock por sucursal.

Centro de Comando (Centro): Pestañas dinámicas para CRM (Fidelización, Historial) y Copiloto Clínico (Alertas IA).

Zona Transaccional (Derecha): Carrito flotante, totalizador de alto contraste y botonera de acción rápida.

Submódulo: Orquestador de Pagos (PaymentModal) Gestiona el cierre financiero de la transacción:

Efectivo: Calculadora de vuelto integrada.

Tarjeta: Integración simulada con terminales POS (Transbank, Klap).

Transferencia: Validación de comprobantes bancarios.

Compliance: Selector obligatorio de Tipo de Receta (Directa, Simple, Retenida).

Submódulo: Tablero Financiero (CashSummaryModal) Panel de control en tiempo real para el cajero y supervisor:

Resumen: Totales segregados por medio de pago.

Flujo de Caja: Detalle de Entradas vs. Salidas.

Privacidad: Botón "Ocultar Montos" para seguridad en sala de ventas.

Submódulo: Cierre de Turno (ZReportModal) Proceso de finalización de jornada:

Congela las métricas de la sesión.

Genera el "Informe Z" para contabilidad.

Reinicia los contadores locales para el siguiente turno.

4. Filtros y Seguridad Implementada
Búsqueda Avanzada: El buscador prioriza resultados por SKU, Nombre y Principio Activo (DCI), ordenando siempre por lote con vencimiento más próximo (FEFO).

Protocolo de Anulación (Void): La eliminación de ítems del carrito está protegida por roles. Si el usuario no tiene el permiso can_authorize_void, se activa el Modal de Supervisor, exigiendo credenciales de nivel Gerencial.

Bloqueo Clínico: Las alertas de seguridad del ClinicalAgent (Interacciones graves, Contraindicaciones) bloquean el proceso de venta hasta que un Químico Farmacéutico autorice mediante PIN.

5. Modelo de Datos (Entidades Financieras)
A. CompletedSale (La Transacción)

Registro inmutable de la venta, incluyendo terminalId, desglose de montos, descuentos aplicados, método de pago y detalle de ítems (snapshot de precios).

B. CashMovement (El Flujo)

Registro de movimientos no relacionados con ventas. Tipos: EXPENSE, SALARY_ADVANCE, WITHDRAWAL. Vincula al usuario responsable y al beneficiario (en caso de adelantos).

C. ShiftRecord (La Sesión)

Control de apertura y cierre de caja, registrando hora, fondo inicial y ubicación geográfica (opcional) para auditoría.

# Módulo de Asistente Clínico (Clinical Copilot) - Recorrido de Implementación
Versión: 2.1 (Agentic Era) | Rol: Soporte a la Decisión Farmacéutica

Este documento detalla la arquitectura técnica del Clinical Copilot, un sistema de inteligencia artificial determinista diseñado para aumentar la seguridad del paciente y la eficiencia del profesional farmacéutico en el punto de venta.

## 1. Pila Tecnológica (Stack Específico del Módulo)
*   **Componente UI:** `ClinicalSidebar.tsx`. Un panel lateral reactivo que se activa contextualizadamente durante la venta.
*   **Motor de Lógica:** `clinicalAgent.ts`. Orquesta las validaciones y sugerencias, actuando como un "cerebro" desacoplado de la interfaz.
*   **Base de Conocimiento:** PostgreSQL con búsqueda vectorial (pgvector) para consultas semánticas y relacionales.
*   **Interacción:** Búsqueda en tiempo real (`on-keystroke`) y alertas proactivas que pueden bloquear la dispensación.

## 2. Reglas de Negocio Críticas ("Hard Rules")

### A. Bloqueo por Interacciones Medicamentosas (DDI)
*   **Ubicación:** `src/domain/logic/clinical.ts`
*   **Lógica:** Antes de agregar un medicamento al carrito, el sistema consulta una matriz de interacciones pre-cargada. Si se detecta una interacción de criticidad "ALTA" (ej. Warfarina + Amiodarona), la UI se bloquea.
*   **Mecanismo de Desbloqueo:** Se requiere el PIN de un Químico Farmacéutico para anular el bloqueo, registrando la anulación para auditoría y forzando la advertencia verbal al paciente.

### B. Alertas de Seguridad Geriátrica y Pediátrica
*   **Lógica:** El `clinicalAgent` cruza la fecha de nacimiento del paciente (si está disponible en el CRM) con los fármacos en el carrito.
*   **Reglas:** Aplica criterios de Beers (para adultos mayores) y dosis pediátricas. Si un medicamento como Lorazepam se intenta vender a un paciente de 80 años, dispara una alerta no bloqueante pero de alta visibilidad.

### C. Búsqueda Semántica de Síntomas
*   **Mecanismo:** El buscador del Copiloto no se limita a nombres de productos. Permite consultas en lenguaje natural como "dolor de cabeza fuerte y fiebre".
*   **Tecnología:** Utiliza embeddings de texto para traducir la consulta a un vector y encontrar los principios activos (DCI) más relevantes en la base de datos, sugiriendo productos de venta libre apropiados.

### D. Upselling y Cross-selling Ético
*   **Lógica:** El agente identifica oportunidades de venta complementaria basadas en la coherencia clínica, no solo en la rentabilidad.
*   **Ejemplo:** Si se vende un antibiótico, el sistema sugiere proactivamente un probiótico para restaurar la flora intestinal. Esta sugerencia es informativa, no agresiva.

## 3. Arquitectura del Componente (`ClinicalSidebar.tsx`)
*   **Diseño "Intrusivo Inteligente":** El sidebar permanece colapsado por defecto. Se expande automáticamente solo si:
    1.  El usuario lo invoca explícitamente (ej. `F7`).
    2.  El `clinicalAgent` dispara una alerta de seguridad.
*   **Pestañas de Información:**
    1.  **Alertas:** Muestra interacciones, contraindicaciones o alertas de dosis en formato de tarjetas de colores (Rojo para Crítico, Naranja para Advertencia).
    2.  **Búsqueda:** Interfaz para la búsqueda semántica de síntomas y productos.
    3.  **Historial:** Visualiza el historial de dispensación del paciente, permitiendo detectar patrones de uso o posibles abusos.

## 4. Modelo de Datos (Entidades Relevantes)
*   **`products.control_level`:** Campo ENUM que define si un producto requiere receta simple, retenida o es de venta libre. Es la base para las validaciones de dispensación.
*   **`drug_interactions` (Tabla Virtual):** Una tabla o vista materializada que contiene pares de DCI y el nivel de severidad de su interacción.
*   **`patient_profiles` (Tabla CRM):** Almacena datos demográficos como fecha de nacimiento y alergias conocidas, alimentando las reglas de seguridad personalizadas.

# Módulo de Gestión de Inventario - Recorrido de Implementación
Versión: 2.1 (Agentic Era) | Rol: Guardián de Activos Físicos

Este documento describe la arquitectura del módulo de Inventario, diseñado para una trazabilidad a nivel de lote, cumplimiento regulatorio y minimización de pérdidas.

## 1. Pila Tecnológica
*   **Componentes UI:** `StockAdjustmentModal.tsx`, `InventoryPage.tsx`.
*   **Lógica de Negocio:** `src/domain/logic/scm.ts` (Supply Chain Management).
*   **Persistencia:** Manipulación directa de la tabla `inventory_batches` en PostgreSQL.
*   **Interacción:** Escáner de código de barras para operaciones de alta velocidad (recepción, conteo).

## 2. Reglas de Negocio Críticas ("Hard Rules")

### A. Trazabilidad FEFO (First Expired, First Out)
*   **Lógica:** A nivel de base de datos, las consultas para la venta (`SELECT`...`FROM inventory_batches`) siempre ordenan los lotes por `expiry_date ASC`. El sistema obliga a vender el producto más próximo a vencer.
*   **Impacto:** Reduce las pérdidas por vencimiento y asegura el cumplimiento de normativas sanitarias.

### B. Recepción Ciega (Blind Receiving)
*   **Ubicación:** `StockAdjustmentModal.tsx` en modo "Recepción".
*   **Mecanismo:** La UI oculta la cantidad de unidades esperadas según la orden de compra. El operario de bodega debe escanear o contar físicamente cada ítem.
*   **Seguridad:** El sistema compara el conteo ciego con la orden de compra solo al finalizar. Las discrepancias se marcan para investigación, desincentivando el robo "hormiga".

### C. Gestión de Estados de Stock
*   **Lógica:** La columna `inventory_batches.status` gobierna el ciclo de vida del producto:
    *   `AVAILABLE`: Disponible para la venta.
    *   `QUARANTINE`: Bloqueado por sospecha de problemas de calidad (ej. cadena de frío) o para devolución. No se puede vender.
    *   `RESERVED`: Comprometido en una venta en curso o transferencia entre locales.
    *   `EXPIRED`: Vencido. El sistema lo mueve automáticamente a este estado y lo excluye de la venta.
*   **Automatización:** Un `cron job` nocturno (o trigger de base de datos) puede reclasificar lotes a `EXPIRED` para mantener la integridad del inventario.

### D. Kardex Inmutable
*   **Lógica:** Cada movimiento de inventario (venta, ajuste, recepción, merma) no modifica un registro, sino que inserta una nueva transacción en una tabla de `inventory_movements`.
*   **Auditoría:** Provee un historial completo e inalterable de cada unidad de producto, desde que entra a la farmacia hasta que sale. Esto es fundamental para auditorías del ISP.

## 3. Arquitectura de Componentes

### `InventoryPage.tsx`
*   **Vista Maestra:** Una tabla virtualizada de alto rendimiento que muestra el consolidado de todos los productos.
*   **Detalle por Lote:** Permite expandir cada producto para ver los lotes asociados, con sus fechas de vencimiento, cantidades y estados.
*   **Acciones Rápidas:** Botones para iniciar un "Ajuste de Stock", mover un lote a "Cuarentena" o marcarlo como "Merma".

### `StockAdjustmentModal.tsx`
*   **Componente Multipropósito:** Un modal único que adapta su comportamiento según el "motivo" del ajuste:
    1.  **Recepción de Mercadería:** Flujo de conteo ciego.
    2.  **Ajuste Manual (+/-):** Requiere un motivo (ej. "Conteo cíclico", "Error de digitación") y permisos de supervisor.
    3.  **Merma por Deterioro/Vencimiento:** Registra la pérdida y la saca del inventario vendible.

## 4. Modelo de Datos (Entidades Clave)
*   **`inventory_batches`:** El corazón del sistema. Cada fila es una combinación única de Producto + Lote + Ubicación. Contiene la "verdad" sobre el stock físico.
*   **`products.storage_condition`:** Un ENUM (`AMBIENTE`, `REFRIGERADO`) que puede activar alertas en la UI si un producto requiere condiciones especiales.
*   **`inventory_movements` (Tabla de Transacciones):** Registra el `qué`, `cuándo`, `quién`, `dónde` y `por qué` de cada cambio en la cantidad de un lote.

# Módulo de Cadena de Suministro (Supply Chain) - Recorrido de Implementación
Versión: 2.1 (Agentic Era) | Rol: Optimizador de Capital de Trabajo

Este documento detalla la arquitectura del módulo de Supply Chain, cuyo objetivo es automatizar y optimizar el proceso de compra para maximizar la disponibilidad de productos y minimizar el capital inmovilizado en inventario.

## 1. Pila Tecnológica
*   **Componentes UI:** `KanbanBoard.tsx`, `ManualOrderModal.tsx`.
*   **Motor de Lógica:** `purchasingAgent.ts`, `scm.ts`.
*   **Visualización:** Librería de arrastrar y soltar (ej. `dnd-kit`) para el tablero Kanban.

## 2. Reglas de Negocio Críticas ("Hard Rules")

### A. Agente de Compra Proactivo
*   **Ubicación:** `src/domain/logic/purchasingAgent.ts`
*   **Lógica:** Un servicio de fondo (`background worker`) analiza continuamente los datos de venta (velocidad) y el stock actual para cada producto.
*   **Cálculo de Stock Crítico:**
    *   `Stock Mínimo = (Venta Diaria Promedio * Lead Time de Proveedor) + Stock de Seguridad`
    *   `Stock de Seguridad = Venta Diaria Promedio * Factor de Incertidumbre`
*   **Output:** Cuando el `stock_actual <= stock_crítico`, el agente crea automáticamente una "Sugerencia de Compra" en el tablero Kanban.

### B. Clasificación ABC de Inventario
*   **Lógica:** El sistema clasifica los productos en categorías A, B o C basándose en el Principio de Pareto (80/20):
    *   **Clase A:** ~20% de los productos que representan ~80% del valor de venta. Se gestionan con alta prioridad.
    *   **Clase B:** Productos de importancia media.
    *   **Clase C:** ~50% de los productos que apenas rotan. Se gestionan con baja prioridad.
*   **Impacto:** El `purchasingAgent` es más agresivo con el `Stock de Seguridad` de los productos Clase A para evitar quiebres de stock, mientras que es más conservador con los Clase C para no inmovilizar capital.

### C. Proceso de Compra Visual (Kanban)
*   **Ubicación:** `KanbanBoard.tsx`
*   **Columnas:** El proceso de compra se modela como un flujo de estados:
    1.  **Sugerencias:** Tarjetas creadas automáticamente por el `purchasingAgent`.
    2.  **Para Ordenar:** El encargado de compras arrastra las sugerencias que aprueba a esta columna.
    3.  **Ordenado:** Se genera la Orden de Compra (OC) y se envía (simulado) al proveedor.
    4.  **En Tránsito:** La OC fue confirmada por el proveedor.
    5.  **Recibido (Parcial/Total):** La OC se vincula con el módulo de "Recepción Ciega".
*   **Interacción:** Permite agrupar múltiples sugerencias en una sola Orden de Compra para optimizar fletes.

## 3. Arquitectura de Componentes

### `KanbanBoard.tsx`
*   **Tarjetas Inteligentes:** Cada tarjeta en el tablero no es solo un `div`. Contiene información clave: SKU, nombre del producto, stock actual, venta diaria promedio y proveedor sugerido.
*   **Filtros Rápidos:** Permite filtrar el tablero por proveedor, categoría de producto o Clase ABC.
*   **Feedback Visual:** Las tarjetas de productos Clase A tienen un borde de color distintivo para denotar su importancia.

### `ManualOrderModal.tsx`
*   **Flexibilidad:** Permite al encargado de compras crear una Orden de Compra desde cero, saltándose la sugerencia del agente.
*   **Casos de Uso:** Útil para compras no recurrentes, productos nuevos o para responder a demandas inesperadas (ej. brote de una enfermedad estacional).

## 4. Modelo de Datos (Entidades de Soporte)
*   **`purchase_orders`:** Almacena el encabezado de la OC (proveedor, fecha, estado).
*   **`purchase_order_items`:** Detalla los productos, cantidades y costos negociados en cada OC.
*   **`products.abc_classification`:** El campo ENUM (`A`, `B`, `C`) que alimenta la lógica de priorización del agente de compras.
*   **`suppliers` (Tabla):** Contiene información de proveedores, incluyendo su `lead_time` promedio en días, que es crucial para el cálculo del stock crítico.

## Agente IA de Abastecimiento (SCM AI Agent) - Versión 2.1
*   **Stack y arquitectura:** Funcional puro en `src/domain/logic/purchasingAgent.ts`; paradigma Functional Core / Imperative Shell sobre Zustand (lectura en memoria, despacha acciones atómicas). Strict TypeScript para precisión aritmética y operación offline-first.
*   **Ciclo cognitivo (4 fases):**
    1.  **Velocity real:** Calcula venta diaria de 30 días; si hay <7 días de historia, cae en `avg_daily_sale` manual.
    2.  **Gap Analysis:** `Stock objetivo = VDP * días cobertura (15 por defecto)`; considera stock en tránsito para evitar doble compra.
    3.  **Supplier matching:** Usa `preferredSupplierId` o mapea categoría a proveedor; preparado para criterios por costo o lead time.
    4.  **Clusterización:** Agrupa déficits por proveedor y genera OC en estado `SUGGESTED` con costo total estimado.
*   **Mejoras estratégicas:** Considera lead time de proveedor, redondea con `Math.ceil` para logística y evita productos en `QUARANTINE` o `EXPIRED` en los cálculos.
*   **Implementación de referencia:** Ver helper `calculatePendingStock` para descontar tránsito; `findSupplierForCategory` para fallback de proveedor; ordenes generadas con `crypto.randomUUID()` y nota explicativa de cobertura.
*   **UI de integración:** Botón “Ejecutar Agente IA” en `SupplyChainPage.tsx` que llena la columna "Sugerencias IA" del Kanban; las tarjetas pasan a `DRAFT` al ser aprobadas para mantener control humano.

# Módulo de Recursos Humanos (RR.HH.) - Recorrido de Implementación
Versión: 2.1 (Agentic Era) | Rol: Cumplimiento Laboral y Operativo

Este documento detalla la arquitectura del módulo de RR.HH., enfocado en la automatización de procesos laborales chilenos y la gestión del personal.

## 1. Pila Tecnológica
*   **Componentes UI:** `AttendanceWall.tsx`, `PayrollManager.tsx`, `EmployeeDirectory.tsx`.
*   **Motor de Lógica:** `src/domain/logic/compliance.ts`.
*   **Persistencia:** La tabla `users` se enriquece con campos laborales (`base_salary`, `contract_type`, etc.).

## 2. Reglas de Negocio Críticas ("Hard Rules")

### A. Reloj Control Biométrico (PIN)
*   **Ubicación:** `AttendanceWall.tsx` (Modo Kiosco).
*   **Lógica:** La interfaz está bloqueada y solo presenta un teclado numérico. Los empleados marcan su entrada y salida usando su PIN personal.
*   **Seguridad:** El sistema registra la hora del servidor (`NOW()`) en una tabla `attendance_records`, no la hora del cliente, para evitar adulteraciones. Cada marca de asistencia es inmutable.
*   **Offline-First:** Si el kiosco pierde conexión, las marcas se guardan localmente en Zustand/localStorage y se sincronizan al recuperar la red, marcándolas como "sincronizadas tardíamente".

### B. Motor de Remuneraciones (Legislación Chilena)
*   **Ubicación:** `src/domain/logic/compliance.ts`
*   **Lógica:** Implementa las reglas de cálculo de sueldo líquido:
    1.  **Haberes:** `Sueldo Base + Gratificación Legal (Topeada) + Bonos - Atrasos/Ausencias`.
    2.  **Descuentos Legales:** Calcula las cotizaciones previsionales (AFP, Salud) y el "Impuesto Único al Trabajo".
    3.  **Otros Descuentos:** Procesa los `cash_movements` de tipo `SALARY_ADVANCE` (adelantos de sueldo) y los descuenta del líquido a pagar.
*   **Output:** Genera una `payslip` (liquidación de sueldo) en formato JSON y PDF, lista para ser firmada digitalmente.

### C. Gestión de Adelantos de Sueldo con Validación en Caja
*   **Flujo Integrado:**
    1.  Un empleado solicita un adelanto en el `POSMainScreen`.
    2.  El cajero abre el `CashMovementModal` y selecciona el tipo "Adelanto de Sueldo".
    3.  El modal exige que el **empleado beneficiario** ingrese su propio PIN en el teclado.
    4.  El sistema valida el PIN. Si es correcto, autoriza la salida del efectivo y crea un registro en `cash_movements` vinculado al `user_id` del beneficiario.
*   **Auditoría:** El PIN actúa como una firma digital, creando un registro indiscutible de que el empleado recibió el dinero.

## 3. Arquitectura de Componentes

### `AttendanceWall.tsx`
*   **Modo Kiosco:** Diseñado para tablets en la entrada de la farmacia. Sin barras de navegación, sin menús. Solo el teclado y un feedback visual (`"Marca Exitosa"` / `"PIN Inválido"`).
*   **Display de Estado:** Muestra quiénes están actualmente "Dentro" del local, útil para supervisores y en caso de emergencias.

### `PayrollManager.tsx`
*   **Panel de Control:** Interfaz para el personal de RR.HH. o contabilidad.
*   **Proceso por Lotes:** Permite seleccionar a todos los empleados y "Correr Proceso de Sueldos" para un mes específico.
*   **Vista Previa y Aprobación:** Genera las liquidaciones en un estado "borrador". El supervisor puede revisarlas, hacer ajustes manuales (ej. agregar un bono excepcional) y luego "Confirmar y Cerrar" el período de pago.

### `EmployeeDirectory.tsx`
*   **Ficha Digital Centralizada:** Un directorio de todo el personal con su información de contacto, rol, y datos laborales.
*   **Acceso Restringido:** Solo los roles `MANAGER` y `ADMIN` pueden ver o editar los datos salariales y contractuales.

## 4. Modelo de Datos (Entidades Fundamentales)
*   **`users`:** La tabla central, extendida para incluir todos los datos necesarios para la liquidación de sueldo, como `health_system` (Fonasa/Isapre) y `pension_fund` (AFP).
*   **`attendance_records`:** Una bitácora de todas las marcas de entrada y salida, con `user_id`, `timestamp`, y `type` (`IN`/`OUT`).
*   **`cash_movements`:** Usada de forma transversal, pero su tipo `SALARY_ADVANCE` la vincula directamente al ciclo de pago de RR.HH.

# Módulo de Business Intelligence (Analytics) - Recorrido de Implementación
Versión: 2.1 (Agentic Era) | Rol: Cerebro Estratégico

Este documento describe la arquitectura del módulo de Analytics, diseñado para transformar datos transaccionales en insights accionables para la gerencia.

## 1. Pila Tecnológica
*   **Componentes UI:** `AnalyticsPage.tsx`, `AuditDashboard.tsx`.
*   **Librería de Gráficos:** `Recharts`. Elegida por su composición y flexibilidad.
*   **Backend:** Vistas materializadas y funciones de agregación en PostgreSQL para acelerar las consultas.
*   **Exportación:** Generación de archivos `.xlsx` para análisis en Excel.

## 2. Lógica de Negocio y KPIs

### A. Vistas Materializadas Pre-calculadas
*   **Estrategia:** En lugar de calcular métricas complejas en cada carga de página, se utilizan vistas materializadas en la base de datos que se actualizan periódicamente (ej. cada hora).
*   **Ejemplo (`daily_sales_summary`):**
    ```sql
    CREATE MATERIALIZED VIEW daily_sales_summary AS
    SELECT
        date_trunc('day', timestamp) AS sale_day,
        location_id,
        payment_method,
        SUM(total_amount) AS total_sales,
        COUNT(id) AS transaction_count
    FROM sales
    GROUP BY 1, 2, 3;
    ```
*   **Beneficio:** Los dashboards cargan casi instantáneamente, ya que solo consultan datos pre-agregados.

### B. KPIs (Key Performance Indicators) Financieros
*   **Ticket Promedio:** `total_sales / transaction_count`.
*   **Margen Bruto:** `(SUM(sale_items.total_price) - SUM(inventory_batches.unit_cost)) / SUM(sale_items.total_price)`. Requiere un `JOIN` complejo, ideal para una vista materializada.
*   **Índice de Rotación de Inventario:** `Costo de Mercadería Vendida (CMV) / Valor de Inventario Promedio`.

### C. KPIs Operacionales y de Cumplimiento
*   **Fill Rate de Proveedores:** `% de unidades recibidas vs. % de unidades ordenadas`. Mide la fiabilidad de los proveedores.
*   **Tasa de Discrepancia en Recepción Ciega:** `% de diferencia entre lo contado y lo facturado`. Un KPI para la honestidad y precisión de la bodega.
*   **Ratio de Anulaciones por Cajero:** `COUNT(anulaciones) / COUNT(transacciones)`. Puede indicar necesidad de re-entrenamiento o posible actividad fraudulenta.

## 3. Arquitectura de Componentes

### `AnalyticsPage.tsx`
*   **Dashboard Gerencial:** Una vista de alto nivel con los KPIs más críticos para la salud del negocio.
*   **Filtros Globales:** Permite filtrar todo el dashboard por rango de fechas y por sucursal (`location_id`).
*   **Componentes Reutilizables:** La página está compuesta por `Widget`s individuales (ej. `SalesChart`, `TopProductsList`), cada uno responsable de buscar y mostrar un KPI específico.

### `AuditDashboard.tsx`
*   **Foco en Seguridad:** Este dashboard no muestra ventas, sino actividad sensible.
*   **Métricas de Auditoría:**
    *   Anulaciones de venta por supervisor.
    *   Ajustes de inventario manuales (quién, qué, cuánto, cuándo).
    *   Adelantos de sueldo otorgados.
    *   Accesos fuera de horario.
*   **Objetivo:** Disuadir el fraude interno al hacer visible toda operación "delicada".

## 4. Modelo de Datos y Fuentes
*   **`sales` y `sale_items`:** Fuente primaria para todos los KPIs de venta.
*   **`inventory_movements`:** Esencial para el `AuditDashboard` y para calcular el CMV.
*   **`purchase_orders` y sus ítems:** Usados para calcular el Fill Rate de proveedores.
*   **`users` y `attendance_records`:** Permiten analizar la productividad por empleado (ventas por hora trabajada).

# Módulo de Seguridad y Control de Acceso - Recorrido de Implementación
Versión: 2.1 (Agentic Era) | Rol: Guardián del Sistema

Este documento detalla la arquitectura del módulo de Seguridad, responsable de la autenticación, autorización y auditoría de todas las operaciones dentro del ERP.

## 1. Pila Tecnológica
*   **Componentes UI:** `UserManagement.tsx`, `AccessControlPage.tsx` (Kiosco).
*   **Lógica de Negocio:** `src/domain/security/SecurityService.ts`.
*   **Criptografía:** `bcrypt` para el hash de contraseñas y PINes.
*   **Estado de Sesión:** Zustand persistido, con validación de token en cada operación crítica.

## 2. Reglas de Negocio Críticas ("Hard Rules")

### A. Doble Credencial: Contraseña y PIN
*   **Lógica:** El sistema exige dos factores de autenticación distintos para diferentes contextos:
    *   **Contraseña (`password_hash`):** Almacenada con un alto costo de `bcrypt`. Se usa para el login inicial en la aplicación web, que da acceso a módulos no transaccionales (Analytics, RR.HH., Configuración).
    *   **PIN (`pin_hash`):** Un código numérico de 4-6 dígitos, hasheado con un costo menor para una validación más rápida. Se usa exclusivamente para operaciones de alta frecuencia y sensibilidad en el POS y Kioscos (ej. iniciar sesión en caja, autorizar anulaciones, marcar asistencia).
*   **Separación de incumbencia:** Un `ADMIN` puede resetear la contraseña de un usuario, pero nunca ver o resetear su PIN. El PIN es personal e intransferible, y solo puede ser cambiado por el propio usuario.

### B. Matriz de Permisos Basada en Roles (RBAC)
*   **Ubicación:** `src/domain/security/SecurityService.ts`.
*   **Mecanismo:** Se define una matriz estática que mapea cada `user_role` a un conjunto de permisos granulares.
    ```typescript
    const permissions = {
      CASHIER: ['can_sell', 'can_open_shift'],
      MANAGER: ['can_sell', 'can_open_shift', 'can_authorize_void', 'can_adjust_inventory'],
      // ... otros roles
    };
    ```
*   **Aplicación:** En el frontend, se usan `Hooks` de React (`usePermissions`) que consultan esta matriz para renderizar condicionalmente botones o bloquear rutas. En el backend, un `middleware` valida el permiso antes de ejecutar cualquier mutación en la base de datos.

### C. Protocolo de Anulación con Escalada de Privilegios
*   **Flujo:**
    1.  Un `CASHIER` intenta anular un ítem o una venta completa.
    2.  El sistema detecta que no tiene el permiso `can_authorize_void`.
    3.  Automáticamente, se abre un `SupervisorPINModal`.
    4.  Un `MANAGER` (o un rol superior) debe acercarse e ingresar su PIN.
    5.  El sistema valida el PIN del supervisor y, si es correcto, procede con la anulación, pero la registra en la tabla `audit_log` asociando la operación al supervisor que la autorizó, no al cajero que la inició.

## 3. Arquitectura de Componentes

### `UserManagement.tsx`
*   **Panel de Administración:** Interfaz para que los `ADMIN` creen, editen y desactiven usuarios.
*   **Asignación de Roles:** Permite asignar y cambiar el `user_role` de los empleados.
*   **Reseteo de Contraseña:** Botón para iniciar el flujo de reseteo de contraseña (no de PIN).

### `AccessControlPage.tsx`
*   **Página de Aterrizaje Segura:** Es la primera pantalla que ve un usuario al entrar a la URL de la farmacia.
*   **Lógica de Enrutamiento:**
    *   Si la URL es `.../kiosco`, renderiza únicamente el `AttendanceWall` para marcar asistencia.
    *   Para cualquier otra ruta, presenta el login principal. Si el usuario ya tiene una sesión válida, lo redirige a su `LandingPage` según su rol.

## 4. Modelo de Datos y Auditoría
*   **`users.role`:** La columna `user_role` es la piedra angular de todo el sistema de permisos.
*   **`users.pin_hash` y `users.password_hash`:** Almacenan de forma segura las credenciales, impidiendo su recuperación en texto plano.
*   **`audit_log` (Tabla):** Una tabla crítica que registra todas las acciones sensibles:
    *   `action_type`: (ej. `VOID_SALE`, `MANUAL_STOCK_ADJUSTMENT`, `LOGIN_FAILURE`).
    *   `user_id`: El usuario que realizó la acción.
    *   `authorizing_user_id`: (Opcional) El supervisor que autorizó la acción.
    *   `details`: Un campo `JSONB` para guardar el contexto (ej. qué producto se anuló, de qué venta).
    *   `timestamp`: La hora exacta de la operación.

---

# Módulo de Testing y Calidad - Documentación Técnica
Versión: 2.1 (Agentic Era) | Rol: Garantía de Calidad

Este documento detalla la arquitectura de testing del sistema, incluyendo tests unitarios, de integración y end-to-end (E2E).

## 1. Pila Tecnológica de Testing
*   **Framework de Tests Unitarios:** Vitest (compatible con Jest, más rápido).
*   **Framework de Tests E2E:** Playwright (multi-browser, recording).
*   **Mocking:** `vi.mock()` para módulos, `vi.fn()` para funciones.
*   **Cobertura:** 339+ tests unitarios pasando, 65 tests de hooks.

## 2. Estructura de Tests

### A. Tests Unitarios (`tests/actions/`)
*   **Ubicación:** `tests/actions/*.test.ts`
*   **Cobertura:** Cada módulo de negocio tiene su archivo de test correspondiente.
*   **Patrón de Mock:** Se usa el patrón "inline mock" para `pool.connect`:
    ```typescript
    const mockQuery = vi.fn();
    vi.mock('@/lib/db', () => ({
        pool: {
            connect: () => Promise.resolve({
                query: mockQuery,
                release: vi.fn()
            })
        }
    }));
    ```

### B. Tests de Hooks (`tests/hooks/`)
*   **Archivos clave:** `useProductSearch.test.ts`, `useCheckout.test.ts`
*   **Propósito:** Validar la lógica de estado y efectos de los hooks de React.

### C. Tests de Integración (`tests/integration/`)
*   **Archivos:** `users-v2.integration.test.ts`, `inventory-fix.test.ts`
*   **Requisito:** Necesitan `POSTGRES_URL` configurada para ejecutarse.
*   **Estado:** Marcados como `skip` si no hay DB disponible.

### D. Tests End-to-End (`tests/e2e/`)
*   **Framework:** Playwright
*   **Configuración:** `playwright.config.ts` con `baseURL: 'http://localhost:3000'`
*   **Helper de Login:** `tests/e2e/helpers/login.ts`

## 3. Flujo de Login para Tests E2E

> **IMPORTANTE:** El flujo de login de la aplicación NO es un formulario email/password tradicional.

### Flujo Correcto (Actualizado 27/01/2026)
```typescript
// 1. Ir a la página inicial
await page.goto('/');

// 2. Seleccionar sucursal
await page.click('button:has-text("Farmacia Vallenar santiago")');

// 3. Click en ACCEDER del módulo deseado
await page.click('button:has-text("ACCEDER")');

// 4. Seleccionar usuario
await page.click('text=Gerente General 1');

// 5. Ingresar PIN
await page.fill('input[type="password"]', '1213');

// 6. Click en Entrar
await page.click('button:has-text("Entrar")');

// 7. Verificar redirección
await expect(page).toHaveURL(/.*dashboard.*/);
```

### Credenciales de Prueba
| Usuario | PIN | Rol |
|---------|-----|-----|
| Gerente General 1 | 1213 | MANAGER |
| Cajero 1 | 1234 | CASHIER |

## 4. Ejecución de Tests

### Tests Unitarios
```bash
npm test                              # Todos los tests unitarios
npm test -- tests/actions/inventory-v2.test.ts  # Test específico
```

### Tests E2E
```bash
# Requiere servidor corriendo en puerto 3000
npm run dev

# En otra terminal
npx playwright test                           # Todos los E2E
npx playwright test tests/e2e/inventory.spec.ts  # Test específico
npx playwright test --headed                  # Con navegador visible
```

## 5. Resolución de Problemas Comunes

### Error: "Cannot find element input[name='username']"
*   **Causa:** El test usa el flujo de login anterior (incorrecto).
*   **Solución:** Importar el helper `loginAsManager` de `tests/e2e/helpers/login.ts`.

### Error: Timeout esperando selector
*   **Causa:** El servidor no está corriendo o tarda en hidratar.
*   **Solución:** Asegurar que `npm run dev` esté activo y usar `waitUntil: 'domcontentloaded'`.

### Tests de integración skipped
*   **Causa:** No hay `POSTGRES_URL` configurada.
*   **Solución:** Configurar variable de entorno con conexión a la base de datos de pruebas.
