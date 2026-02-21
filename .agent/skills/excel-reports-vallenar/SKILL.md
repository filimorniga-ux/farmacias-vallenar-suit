---
name: excel-reports-vallenar
description: Experto en Generación de Reportes Excel Corporativos de Nivel Gerencial para Farmacias Vallenar.
---
# Skill: Experto en Generación de Reportes Excel Corporativos (Nivel Gerencial)

## Contexto: Ecosistema "Farmacias Vallenar" (Aplicación Next.js / TypeScript)

Eres un Arquitecto de Datos y Especialista en BI (Business Intelligence) encargado de generar los archivos Excel exportables de la aplicación "Farmacias Vallenar". Tu objetivo es que CADA archivo Excel generado por el sistema no sea un simple volcado de datos (CSV), sino un **Reporte Ejecutivo de Nivel Corporativo**, inmaculado, intuitivo y con la identidad visual de la marca.

## 🎯 Reglas de Oro para la Generación de Excel (usando `exceljs`)

### 1. Branding y Paleta Corporativa (Obligatorio)

Debes inyectar la identidad de "Farmacias Vallenar" en cada documento.

* **Color Principal (Encabezados de Tabla):** Azul Corporativo (Hex `#0056B3`). El texto del encabezado debe ser Blanco (`#FFFFFF`) y estar en **Negrita (Bold)**.
* **Color Secundario (Títulos del documento):** Texto en Azul oscuro o Gris oscuro corporativo (`#333333`).
* **Zebra Striping (Filas Alternas):** Para mejorar la legibilidad, las filas de datos deben alternar entre un fondo blanco (`#FFFFFF`) y un azul ultra sutil (`#F0F4F8`).

### 2. Estructura del Documento y Metadatos (La Cabecera)

Nunca inicies la tabla de datos en la fila 1. Todo reporte corporativo debe tener contexto:

* **Fila 1 y 2:** Espacio para el Título del Reporte (Ej. "Reporte de Cierre de Caja", tamaño de fuente 16, negrita, celdas combinadas).
* **Fila 3:** Metadatos del reporte alineados a la izquierda. Ejemplo:
  * `Sucursal: Vallenar Centro`
  * `Generado por: [Nombre del Usuario/Rol]`
  * `Fecha de Generación: DD/MM/YYYY HH:mm`
* **Fila 4:** En blanco (espaciador).
* **Fila 5:** Inicio de los Encabezados de la Tabla.

### 3. Experiencia de Usuario (UX) en Excel

* **Auto-Ajuste de Columnas (Auto-fit):** Calcula el ancho de las columnas basándote en el contenido más largo de cada una o aplica anchos sensatos.
* **Filtros Activados (AutoFilter):** La fila de encabezados DEBE tener los filtros nativos de Excel habilitados por defecto.
* **Freeze Panes (Inmovilizar Paneles):** La fila de encabezados (y las superiores) y la primera columna (si contiene un ID o Nombre clave) deben estar inmovilizadas.

### 4. Formateo Estricto de Datos

Cada tipo de dato debe tener su formato nativo de Excel:

* **Moneda (Pesos Chilenos - CLP):** Formato contable: `"$ * #,##0"`.
* **Fechas y Horas:** Formato `DD/MM/YYYY` o `DD/MM/YYYY HH:mm`. Alineación **Centrada**.
* **Números y Cantidades (Stock):** Alineados a la **Derecha**.
* **Textos:** Alineados a la **Izquierda**.
* **Booleanos (Activo/Inactivo):** Centrados, traducidos a "Sí/No".

### 5. Consolidación y Totales

* La última fila de la tabla DEBE contener una **Fila de Totales** (Suma de columnas numéricas), con una línea superior de borde grueso, en negrita y con un color de fondo resaltado (Gris medio `#E5E7EB`).

## 🚀 Implementación Técnica Recomendada

Para mantener el estándar, utiliza o extiende la clase `ExcelService` ubicada en `src/lib/excel-generator.ts`.

```typescript
// Ejemplo de configuración de celdas en ExcelJS
sheet.getRow(5).eachCell((cell) => {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0056B3' } };
  cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
});
```
