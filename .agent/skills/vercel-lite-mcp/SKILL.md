---
description: Despliega un servidor MCP ligero para Vercel que evita límites de herramientas y permite control total vía API.
---

# Vercel Lite MCP Server

Esta habilidad proporciona un servidor MCP optimizado para gestionar proyectos y despliegues en Vercel sin saturar la interfaz del IDE con cientos de herramientas innecesarias.

## Problema que resuelve

El servidor MCP oficial de Vercel (`@robinson_ai_systems/vercel-mcp` o similar) expone más de 150 herramientas, lo que a menudo supera el límite de 100 herramientas de muchos entornos de agentes (como este), bloqueando la interfaz de configuración.

## Solución

`vercel-lite-mcp` es un servidor minimalista que expone solo 4 herramientas esenciales:

1. `vercel_list_projects`: Listar proyectos.
2. `vercel_list_deployments`: Listar despliegues.
3. `vercel_create_deployment`: Crear un nuevo despliegue.
4. **`vercel_api_request`**: Herramienta universal para realizar cualquier petición a la API de Vercel.

## Instalación

### 1. Copiar los recursos

Copia el contenido de la carpeta `resources/` de esta skill a una ubicación en tu proyecto, por ejemplo `.gemini/custom_mcp/vercel-lite/`.

### 2. Instalar dependencias

Navega al directorio creado y ejecuta:

```bash
npm install
```

### 3. Configurar MCP

Añade la siguiente configuración a tu `mcp_config.json`:

```json
"vercel-lite": {
  "command": "node",
  "args": [
    "/ruta/absoluta/a/tu/proyecto/.gemini/custom_mcp/vercel-lite/index.js"
  ],
  "env": {
    "VERCEL_TOKEN": "tu_token_de_vercel"
  }
}
```

## Uso

Una vez configurado, tendrás acceso a las 4 herramientas mencionadas.
Para operaciones complejas no cubiertas por las herramientas básicas, usa `vercel_api_request` con el endpoint deseado (consulta la [documentación de la API de Vercel](https://vercel.com/docs/rest-api)).

Ejemplo de `vercel_api_request` para borrar un proyecto:

- **method**: `DELETE`
- **endpoint**: `/v9/projects/mi-proyecto-id`
