# code_review.md — Checklist de Revisión de Código — Farmacias Vallenar

## 1. Seguridad

### Autenticación & Autorización

- [ ] ¿Toda Server Action valida la sesión con `createServerClient` antes de operar?
- [ ] ¿Las rutas protegidas tienen middleware que redirige si no hay sesión?
- [ ] ¿Los roles de usuario se verifican en el servidor (no solo en el cliente)?
- [ ] ¿No hay lógica de autorización solo en el frontend?

### Datos & RLS

- [ ] ¿Todas las tablas públicas tienen RLS habilitado?
- [ ] ¿Las políticas de INSERT/UPDATE/DELETE están acotadas a roles específicos?
- [ ] ¿Las funciones SQL tienen `search_path = public, pg_temp`?
- [ ] ¿Las vistas sensibles usan `security_invoker = true`?

### Inputs

- [ ] ¿Los inputs del usuario se validan con Zod u otro schema validator?
- [ ] ¿Los parámetros de URL/searchParams se parsean y validan antes de usarlos en queries?
- [ ] ¿Los uploads de archivos validan tipo MIME y tamaño en el servidor?

### Tokens & Secretos

- [ ] ¿`SUPABASE_SERVICE_ROLE_KEY` solo se usa en Server Actions / Route Handlers?
- [ ] ¿No hay claves secretas en variables `NEXT_PUBLIC_`?
- [ ] ¿No hay credenciales hardcodeadas en el código?
- [ ] ¿Los logs de Sentry no incluyen datos sensibles (PII, tokens)?

## 2. Rendimiento

- [ ] ¿Las consultas a Supabase usan `.select('campo1, campo2')` solo los campos necesarios?
- [ ] ¿No hay consultas N+1 en Server Components o loops?
- [ ] ¿Los Server Components cachean datos con `unstable_cache` o `revalidatePath` correctamente?
- [ ] ¿Las imágenes usan `<Image>` de Next.js con `loading="lazy"` y `sizes`?
- [ ] ¿Los componentes pesados usan `dynamic()` con `{ ssr: false }` si aplica?
- [ ] ¿Los índices existen en columnas de búsqueda frecuente (`product_id`, `user_id`, etc.)?

## 3. Calidad de Código

- [ ] ¿Las Server Actions tienen tipado completo (input y output)?
- [ ] ¿No hay `any` sin justificación en TypeScript?
- [ ] ¿Los errores de async/await tienen `try/catch` con manejo explícito?
- [ ] ¿Los mensajes de error al usuario son comprensibles (no errores técnicos)?
- [ ] ¿No hay `console.log` de datos sensibles?
- [ ] ¿No hay código comentado ni funciones muertas sin eliminar?
- [ ] ¿Los tipos de Supabase están generados y actualizados (`database.types.ts`)?

## 4. UX Técnica

- [ ] ¿Los formularios usan `useFormStatus` o similar para estados de carga?
- [ ] ¿Los estados vacíos tienen mensajes claros (no pantallas en blanco)?
- [ ] ¿Los errores de red tienen mensajes de retry o feedback claro?
- [ ] ¿Los formularios validan en cliente antes de enviar al servidor?
- [ ] ¿Las operaciones destructivas tienen confirmación?

## 5. Base de Datos

- [ ] ¿Las migraciones son reversibles o tienen `IF NOT EXISTS`?
- [ ] ¿`TIMESTAMPTZ` se usa en lugar de `TIMESTAMP`?
- [ ] ¿Las foreign keys tienen `ON DELETE CASCADE` o `RESTRICT` según corresponda?
- [ ] ¿Los índices existen para las columnas más consultadas?

## 6. Tests

| Módulo | Cobertura actual | Tests críticos faltantes |
|--------|-----------------|--------------------------|
| Autenticación | ? | Login fallido, sesión expirada, rol insuficiente |
| Caja/Ventas | ? | Venta completa, descuento, pago parcial |
| Inventario | ? | Stock negativo, producto no encontrado |
| RLS Supabase | ? | Usuario sin permisos accede a datos ajenos |
| Server Actions | ? | Input inválido, unauthenticated call |

## 7. Riesgos Conocidos

| Riesgo | Urgencia |
|--------|----------|
| Server Actions sin validación de sesión | ALTA |
| Tipos Supabase desactualizados | MEDIA |
| E2E tests frágiles por datos de prueba no aislados | MEDIA |
| Sin tests unitarios en domain/business logic | MEDIA |
