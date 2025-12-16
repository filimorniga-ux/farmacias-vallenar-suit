import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    // Clone the request headers
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-url', request.url);

    // Create Response
    const response = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });

    // 🔒 Security Headers
    const cspHeader = `
        default-src 'self';
        script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net;
        style-src 'self' 'unsafe-inline';
        img-src 'self' blob: data: https://*; 
        font-src 'self';
        connect-src 'self' https://*; -- ALLOW EXTERNAL API
    `;
    // Replace newlines with spaces
    const contentSecurityPolicyHeaderValue = cspHeader
        .replace(/\s{2,}/g, ' ')
        .trim();

    // response.headers.set('Content-Security-Policy', contentSecurityPolicyHeaderValue); // Disabled for now to avoid breaking UI (unsafe-eval is needed for some libs)

    // X-Frame-Options: DENY (Clickjacking)
    response.headers.set('X-Frame-Options', 'DENY');

    // X-Content-Type-Options: nosniff
    response.headers.set('X-Content-Type-Options', 'nosniff');

    // Referrer-Policy
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions-Policy (Camera needed for Scanner)
    response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');

    return response;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|.*\\.png|.*\\.jpg|.*\\.svg).*)',
    ],
};
