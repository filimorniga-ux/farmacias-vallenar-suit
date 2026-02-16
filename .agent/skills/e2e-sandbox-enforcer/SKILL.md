---
name: e2e-sandbox-enforcer
description: Garantiza pruebas E2E en un entorno Docker totalmente aislado, protegiendo Timescale Cloud de datos semilla y estados de prueba.
---

# E2E Sandbox Enforcer

Este skill es obligatorio para cualquier tarea que requiera cambios en la lógica de negocio, base de datos o flujos complejos. Su objetivo es crear una "Caja de Arena" (Sandbox) donde se pueda romper todo sin afectar la producción o el fork activo en Timescale Cloud.

## 🛡️ Reglas de Oro

1. **Aislamiento de Rama**: NUNCA trabajes directamente en `main`. Al activar este skill, el agente debe crear una rama `sandbox/[nombre-tarea]`.
2. **Aislamiento de Datos**: El archivo `.env` debe configurarse para apuntar ÚNICAMENTE al Docker local (`localhost:5432`). La URL de Timescale Cloud debe quedar comentada y bloqueada.
3. **Semilla Local**: Los datos de prueba (ventas, usuarios con PINs temporales, sucursales ficticias) se inyectan solo en Docker.
4. **Protección de Salida**: Antes de fusionar (merge) hacia `main`, el agente debe garantizar que:
    - Los datos de prueba NO se exporten a la base de datos de la nube.
    - Se restaure la configuración del `.env` hacia el fork oficial de Timescale.
    - Se verifique que el esquema (estructura) sea compatible, pero los datos (filas) sean los originales de la nube.

## 🛠️ Protocolo de Activación

### Fase 1: Preparación del Entorno

1. Confirmar que Docker está corriendo: `docker ps`.
2. Crear la rama de seguridad: `git checkout -b sandbox/task-00x`.
3. Modificar `.env`:

   ```bash
   # BLOQUEADO POR E2E-SANDBOX
   # DATABASE_URL="url-de-timescale-cloud"
   DATABASE_URL="postgres://postgres:postgres@localhost:5432/farmacia_vallenar"
   ```

### Fase 2: Inyección de Semillas (Solo Docker)

Ejecutar scripts de población de datos específicos para test:

- `npm run seed:sandbox` (Crea sucursales, terminales, usuarios con PIN '1213', ventas de hoy).

### Fase 3: Ejecución de Test E2E

- Ejecutar Playwright o Vitest en modo Sandbox.
- Capturar logs y evidencias de que la lógica funciona con los datos locales.

### Fase 4: Limpieza y Despliegue Seguro

1. **Reset de Datos**: Antes de volver a `main`, se debe asegurar que no existan scripts de migración que inserten datos basura en producción.
2. **Restauración de Cloud**: Volver a activar la `DATABASE_URL` de Timescale en el `.env`.
3. **Prueba de Humo (Smoke Test)**: Ejecutar una consulta rápida a la nube para confirmar que la nueva estructura (campos nuevos, tablas nuevas) no rompe los datos reales recuperados.

## 🚨 Control de Riesgos

- Si el agente detecta un intento de `git push` a `main` con el `.env` apuntando a Docker, el proceso debe abortarse.
- Si se detecta un comando de borrado (`DROP TABLE` o `DELETE`) sin filtro por rama sandbox, se debe pedir confirmación doble.
