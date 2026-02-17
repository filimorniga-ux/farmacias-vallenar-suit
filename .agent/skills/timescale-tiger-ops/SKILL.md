# Skill: timescale-tiger-ops

## Descripción

Guía y comandos optimizados para la gestión de bases de datos en Timescale Tiger Cloud utilizando la CLI `tiger`. Esta skill garantiza que las operaciones de mantenimiento, diagnóstico y recuperación sean rápidas y seguras.

## Comandos Principales

### 1. Gestión de Servicios

- **Listar estados:** `tiger service list`
- **Ver detalles técnicos:** `tiger service get <service-id>`
- **Iniciar/Detener:** `tiger service start <service-id>` / `tiger service stop <service-id>`

### 2. Diagnóstico y Logs

- **Ver logs recientes:** `tiger service logs <service-id> --tail 100`
- **Monitoreo en tiempo real (teórico):** Aunque `tiger` no tiene `--follow` nativo en todas las versiones, se recomienda usar un loop o re-ejecutar `tiger service logs`.

### 3. Consultas Directas

- **Ejecutar SQL:** `tiger query "SELECT ..."` (Asegúrate de tener configurado el `DATABASE_URL` o pasar el `--service-id`).

## Flujos de Trabajo Recomendados

### Recuperación de Punto en el Tiempo (PITR)

1. Identificar el `service-id` del padre.
2. Usar la consola web (o `tiger` si la versión lo soporta) para crear el fork.
3. Al obtener la nueva URL, actualizar el archivo `.env` inmediatamente.

### Resolución de Problemas de Conexión

1. Verificar estado en `tiger service list`.
2. Si el estado es `RESUMING`, revisar logs con `tiger service logs <service-id>`.
3. Validar conectividad de red con `nc -zv <host> <port>`.

### Seguridades

- No exponer el password de la URL en logs compartidos.
- Usar `rejectUnauthorized: false` en entornos de desarrollo para evitar problemas con la cadena de certificación de Timescale Cloud.
