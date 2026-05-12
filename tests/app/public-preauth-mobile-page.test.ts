import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function readProjectFile(filePath: string) {
    return readFileSync(path.join(process.cwd(), filePath), 'utf8');
}

describe('public pre-auth mobile surfaces', () => {
    it('keeps the public web landing mobile-safe and offline-friendly', () => {
        const source = readProjectFile('src/app/web/page.tsx');

        expect(source).toContain('min-h-dvh');
        expect(source).toContain('pt-safe');
        expect(source).toContain('flex flex-col gap-2 sm:flex-row');
        expect(source).toContain('min-h-12 w-full sm:w-auto');
        expect(source).toContain('min-h-11 min-w-11 inline-flex items-center hover:text-white');
        expect(source).toContain('aria-label="Buscar medicamento"');
        expect(source).toContain('searchTerm.trim()');
        expect(source).toContain('src="/assets/logo_vallenar.png"');
        expect(source).not.toContain('images.unsplash.com');
        expect(source).not.toContain('href="#"');
    });

    it('routes public navigation to real destinations instead of the logout route', () => {
        const source = readProjectFile('src/app/web/page.tsx');

        expect(source).toContain('href="/select-context"');
        expect(source).toContain('href="/legal"');
        expect(source).toContain('href="/"');
        expect(source).not.toContain('href="/login"');
        expect(source).toContain('href="tel:+56512612345"');
        expect(source).toContain('href="mailto:soporte@farmaciasvallenar.cl"');
    });

    it('keeps legacy email/password recovery out of the public pre-auth surface', () => {
        const forgotSource = readProjectFile('src/app/forgot-password/page.tsx');
        const resetSource = readProjectFile('src/app/reset-password/[token]/page.tsx');

        for (const source of [forgotSource, resetSource]) {
            expect(source).toContain("redirect('/')");
            expect(source).not.toContain("'use client'");
            expect(source).not.toContain('type="email"');
            expect(source).not.toContain('type="password"');
            expect(source).not.toContain('href="/login"');
        }

        expect(forgotSource).not.toContain('forgotPasswordSecure');
        expect(resetSource).not.toContain('resetPasswordSecure');
    });
});
