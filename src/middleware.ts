import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
    const isMaintenanceMode = process.env.MAINTENANCE_MODE === 'true';

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
