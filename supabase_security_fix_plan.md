# Plan de Acción: Supabase Security Fix

1.  **Vistas `SECURITY DEFINER` a `SECURITY INVOKER`**:
    *   Alterar las vistas listadas (ej. `v_terminals_status`) para usar `SECURITY INVOKER` (default), lo que asegura que las vistas respeten las políticas de seguridad (RLS) del usuario que ejecuta la consulta, no del creador de la vista.

2.  **Habilitar RLS en tablas públicas (`RLS Disabled in Public`)**:
    *   Ejecutar `ALTER TABLE <tabla> ENABLE ROW LEVEL SECURITY;` para todas las tablas expuestas (ej. `users`, `sales`, `inventory`, `cash_movements`, etc.).
    *   **Impacto**: Al habilitar RLS sin políticas, por defecto se **deniega** todo acceso directo a través de la API pública de Supabase (PostgREST) usando la clave `anon` o `authenticated`.
    *   *Nota para la arquitectura actual*: Como Farmacias Vallenar usa Next.js Server Actions (usando la clave `service_role` o un backend con conexión directa de BD), el `service_role` bypasses RLS por defecto. Por lo que habilitar RLS protegerá la BD de accesos externos sin romper el backend actual.

3.  **Proteger Columnas Sensibles (`Sensitive Columns Exposed`)**:
    *   Al habilitar RLS en el paso 2, este punto queda mitigado porque ya no se exponen masivamente las tablas `users` y `audit_log`.
    *   Adicionalmente, asegurar que las contraseñas reales no viajen jamás en select statements hacia el exterior.

Se creará una migración `.sql` para aplicar estos cambios de manera segura.
