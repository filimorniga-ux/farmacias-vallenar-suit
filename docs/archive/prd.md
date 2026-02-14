# Product Requirement Document - Farmacias Vallenar Suit

## 1. Contexto Técnico
- Framework: Next.js 15 (App Router) + Server Actions.
- Base de Datos: PostgreSQL.
- Estado: Zustand (Offline-first).

## 2. Flujo de Autenticación (CRÍTICO PARA EL TEST)
El sistema NO usa formulario de email/password. Sigue estos pasos estrictos para loguearte:
1. Al entrar a la home, verás tarjetas de sucursales.
2. Haz clic en el botón de la sucursal "Farmacia Vallenar santiago".
3. En el menú de módulos, haz clic en el botón "ACCEDER" del módulo "Punto de Venta".
4. Aparecerá una lista de usuarios. Haz clic en el usuario "Gerente General 1".
5. Aparecerá un teclado numérico o campo de PIN. Ingresa el PIN: "1213".
6. Haz clic en "Entrar".

## 3. Credenciales de Prueba
- Rol Manager: Usuario "Gerente General 1" / PIN "1213"
- Rol Cajero: Usuario "Cajero 1" / PIN "1234"

## 4. Reglas de Negocio a Testear
- Anti-Canela: Los productos médicos no deben generar comisión.
- FEFO: Al vender, se debe descontar del lote con vencimiento más próximo.
- Stock: No permitir ventas si el stock es 0 (a menos que sea modo offline).
