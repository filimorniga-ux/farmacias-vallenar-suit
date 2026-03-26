/**
 * ============================================================================
 * BRAND CONFIG — White-Label Multi-Cliente
 * ============================================================================
 * Toda la identidad visual de la app se centraliza aquí.
 * Para cambiar el cliente, solo cambia las variables de entorno NEXT_PUBLIC_BRAND_*.
 *
 * Variables requeridas en .env / .env.production:
 *   NEXT_PUBLIC_BRAND_NAME         → Nombre principal (ej: "Farmacia Ejemplo")
 *   NEXT_PUBLIC_BRAND_SUBTITLE     → Subtítulo del sistema (ej: "SUITE GESTIÓN V1.0")
 *   NEXT_PUBLIC_BRAND_COLOR        → Color primario hex (ej: "#4F46E5")
 *   NEXT_PUBLIC_BRAND_LOGO         → Ruta del logo horizontal (ej: "/logo-horizontal.png")
 *   NEXT_PUBLIC_BRAND_LOGO_ICON    → Ruta del logo cuadrado/icono (ej: "/logo-icon.png")
 *   NEXT_PUBLIC_BRAND_SUPPORT_EMAIL → Email de soporte
 */

export const brand = {
    /** Nombre completo del negocio */
    appName: process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Farmacia Vallenar',

    /** Subtítulo/versión del sistema que aparece bajo el logo */
    appSubtitle: process.env.NEXT_PUBLIC_BRAND_SUBTITLE ?? 'SUIT ENTERPRISE V2.1',

    /** Color primario de la marca (hex) */
    primaryColor: process.env.NEXT_PUBLIC_BRAND_COLOR ?? '#4F46E5',

    /** Logo horizontal (en sidebar expandido y landing) */
    logoHorizontal: process.env.NEXT_PUBLIC_BRAND_LOGO ?? '/logo-horizontal.png',

    /** Logo cuadrado / ícono (en sidebar colapsado y favicon) */
    logoIcon: process.env.NEXT_PUBLIC_BRAND_LOGO_ICON ?? '/logo-horizontal.png',

    /** Email de soporte técnico */
    supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'soporte@farmaciasvallenar.cl',

    /** Nombre corto para tickets y documentos */
    companyShortName: process.env.NEXT_PUBLIC_BRAND_SHORT_NAME ?? 'Farmacia Vallenar',
} as const;

export type Brand = typeof brand;
