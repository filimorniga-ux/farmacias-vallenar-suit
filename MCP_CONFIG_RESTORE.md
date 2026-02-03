# Guia de Restauración de Servidores MCP

Esta guía te ayudará a restaurar la configuración de tus servidores MCP ("Model Context Protocol") para GitHub, Vercel y TimescaleDB (Tiger Cloud).

Debes agregar estas configuraciones a tu cliente MCP (por ejemplo, el archivo de configuración de Claude App `claude_desktop_config.json` o la extensión de VS Code).

## 1. Archivo de Configuración

Si usas **Claude Desktop**:
- Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Si usas una **Extensión de VS Code**, busca en la configuración de la extensión dónde editar el JSON de "MCP Servers".

## 2. Configuraciones (JSON)

Copia y pega los bloques correspondientes dentro de la sección `"mcpServers"` de tu archivo de configuración.

### GitHub
Necesitarás un Token de Acceso Personal (PAT) de GitHub con permisos de repo.
Configura la variable de entorno `GITHUB_PERSONAL_ACCESS_TOKEN`.

```json
"github": {
  "command": "npx",
  "args": [
    "-y",
    "@modelcontextprotocol/server-github"
  ],
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "YOUR_GITHUB_TOKEN_HERE"
  }
}
```

### TimescaleDB (Tiger Cloud) - Opción Oficial (Recomendada)
La forma más robusta de instalar el soporte para Timescale es usando su CLI oficial, ya que maneja la autenticación de forma segura.

Ejecuta los siguientes comandos en tu terminal (uno por uno):

**1. Instalar la CLI de Tiger:**
```bash
curl -fsSL https://cli.tigerdata.com | sh
```

**2. Iniciar sesión:**
```bash
tiger auth login
```
*(Sigue las instrucciones en pantalla para loguearte)*

**3. Guardar contraseña de la base de datos:**
He preparado este comando con tus credenciales:
```bash
TIGER_NEW_PASSWORD='sx0c226s5wbwh8ry' tiger db save-password o1fxkrx8c7
```

**4. Instalar el MCP automáticamente:**
Este comando añadirá la configuración necesaria a tu cliente MCP automáticamente:
```bash
tiger mcp install
```

---
**Opción Alternativa (Manual JSON)**
Si prefieres no instalar la CLI, puedes usar el bloque de conexión genérico:
```json
"timescale": {
  "command": "npx",
  "args": [
    "-y",
    "@modelcontextprotocol/server-postgres",
    "postgres://tsdbadmin:sx0c226s5wbwh8ry@o1fxkrx8c7.m1xugm0lj9.tsdb.cloud.timescale.com:35413/tsdb?sslmode=require"
  ]
}
```

### Vercel
Para Vercel, generalmente se utiliza el paquete oficial o un adaptador. Asegúrate de tener tu token de Vercel.

```json
"vercel": {
  "command": "npx",
  "args": [
    "-y",
    "@modelcontextprotocol/server-vercel"
  ],
  "env": {
    "VERCEL_API_TOKEN": "noLhTeaMXrANzJZtkkOUd25b"
  }
}
```
*Nota: Reemplaza `tu_token_aqui` con tus credenciales reales.*

## 3. Verificación
1. Guarda el archivo de configuración.
2. Reinicia tu cliente MCP (Claude Desktop o VS Code).
3. Verifica que los iconos de "Conectado" aparezcan para cada servicio.
