# Scripts legacy y utilitarios directos

Este directorio contiene utilitarios historicos, diagnosticos puntuales y scripts de migracion/importacion que no forman parte del flujo operativo vigente.

## Regla de uso

- El flujo soportado debe ejecutarse desde `package.json`.
- Si un script directo escribe en DB (`INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `ALTER`, `DROP`), no se debe ejecutar contra datos reales hasta agregar:
  - guard de target local/no-pooler,
  - confirmacion explicita para targets no locales,
  - test focal en `tests/scripts/`.
- No usar `DATABASE_URL` de Supabase pooler para scripts de escritura.
- No ejecutar scripts destructivos contra produccion durante revision manual.

## Estado de auditoria

E23 identifico que los scripts expuestos por `package.json` ya tienen guardrails o bloqueo local. Los scripts restantes de este directorio se consideran deuda historica directa hasta que se migren, se archiven o reciban guardrail individual.

Ver: `docs/operations/audit-e23-legacy-db-scripts.md`.
