import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function readProjectFile(filePath: string) {
    return readFileSync(path.join(process.cwd(), filePath), 'utf8');
}

describe('public kiosk accessibility contracts', () => {
    it('keeps the queue kiosk keyboard usable on narrow touch screens', () => {
        const source = readProjectFile('src/presentation/pages/QueueKioskPage.tsx');

        expect(source).toContain('grid-cols-[repeat(auto-fit,minmax(44px,1fr))]');
        expect(source).toContain('min-h-11 text-lg font-bold');
        expect(source).toContain('aria-label="Agregar espacio al nombre"');
        expect(source).toContain('aria-label="Borrar nombre"');
        expect(source).toContain('aria-label="Volver al paso anterior"');
        expect(source).toContain('aria-label="Salir del tótem de fila"');
        expect(source).toContain('htmlFor="queue-activation-pin"');
        expect(source).toContain('htmlFor="queue-exit-pin"');
        expect(source).not.toContain('autoFocus');
    });

    it('names icon-only controls in the attendance kiosk', () => {
        const source = readProjectFile('src/presentation/pages/AttendanceKioskPage.tsx');

        expect(source).toContain('aria-label="Refrescar estados de asistencia"');
        expect(source).toContain('aria-label="Bloquear terminal de reloj control"');
        expect(source).toContain('aria-label="Volver al inicio desde reloj control"');
        expect(source).toContain('aria-label="Cerrar verificación de asistencia"');
        expect(source).toContain('overflow-y-auto overscroll-contain');
        expect(source).toContain('pt-safe pb-safe');
        expect(source).toContain('max-h-[calc(100dvh-2rem)]');
        expect(source).toContain('min-h-11 min-w-11');
    });

    it('labels pre-auth login inputs and avoids mobile autofocus in the landing modal', () => {
        const source = readProjectFile('src/presentation/pages/LandingPageContent.tsx');

        expect(source).toContain('htmlFor="login-user-search"');
        expect(source).toContain('name="login-user-search"');
        expect(source).toContain('autoComplete="username"');
        expect(source).toContain('htmlFor="employee-pin"');
        expect(source).toContain('inputMode="numeric"');
        expect(source).toContain('htmlFor="supervisor-pin"');
        expect(source).toContain('htmlFor="new-permanent-pin"');
        expect(source).toContain('htmlFor="confirm-permanent-pin"');
        expect(source).not.toContain('autoFocus');
    });
});
