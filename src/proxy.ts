import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(req: NextRequest) {
    // Permitir acceso en Staging (Preview) independiente de la variable de entorno
    const isPreview = process.env.VERCEL_ENV === 'preview';
    const isMaintenanceMode = process.env.MAINTENANCE_MODE === 'true' && !isPreview;

    // 1. Si está activo el modo mantenimiento y NO estamos ya en la página
    if (isMaintenanceMode && !req.nextUrl.pathname.startsWith('/maintenance')) {
        return NextResponse.redirect(new URL('/maintenance', req.url));
    }

    // 2. Si NO está activo, pero intentan entrar manualmente a la página
    if (!isMaintenanceMode && req.nextUrl.pathname.startsWith('/maintenance')) {
        return NextResponse.redirect(new URL('/', req.url));
    }

    // --- PRESERVED SECURITY HEADERS (Critical for Camera/Scanner) ---
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-url', req.url);

    // INJECT AUTH HEADERS FROM COOKIES (Critical for Server Actions)
    const userId = req.cookies.get('user_id')?.value;
    const userRole = req.cookies.get('user_role')?.value;
    const userLocation = req.cookies.get('user_location')?.value;

    if (userId) requestHeaders.set('x-user-id', userId);
    if (userRole) requestHeaders.set('x-user-role', userRole);
    if (userLocation) requestHeaders.set('x-user-location', userLocation);

    const response = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });

    // Security Headers
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Essential for Barcode Scanner in POS
    response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');

    return response;
}

export const config = {
    // Matcher negativo para excluir api y estáticos
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
