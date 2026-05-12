import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('queue display mobile controls', () => {
    it('mantiene controles de monitor táctiles y con nombre accesible', () => {
        const source = readFileSync(
            join(process.cwd(), 'src/app/display/queue/page.tsx'),
            'utf8',
        );

        expect(source).toContain('aria-label="Probar sonido del monitor de turnos"');
        expect(source).toContain('aria-label={isMuted ? "Activar sonido del monitor" : "Silenciar monitor de turnos"}');
        expect(source).toContain('aria-label="Alternar pantalla completa"');
        expect(source).toContain('aria-label="PIN de administración para activar el monitor"');
        expect(source).toContain('aria-label="PIN de administración para salir del monitor"');
        expect(source).toContain('aria-label="Reiniciar o salir del monitor de turnos"');
        expect(source).toContain('aria-label="Probar sonido desde historial del monitor"');
        expect(source).toContain('min-h-11 min-w-11');
        expect(source).toContain('inputMode="numeric"');
        expect(source.match(/inputMode="numeric"/g)?.length).toBeGreaterThanOrEqual(2);
        expect(source).toContain('autoComplete="one-time-code"');
        expect(source).toContain("transition-[border-color,box-shadow]");
        expect(source).toContain('flex flex-col gap-3 sm:flex-row sm:items-center');
        expect(source).toContain('w-full min-w-0 bg-white border border-slate-200');
        expect(source).toContain('min-h-11 w-full sm:w-auto');
    });

    it('mantiene el monitor activo usable en PWA móvil sin romper el layout TV', () => {
        const source = readFileSync(
            join(process.cwd(), 'src/app/display/queue/page.tsx'),
            'utf8',
        );

        expect(source).toContain('grid min-h-dvh grid-cols-1');
        expect(source).toContain('lg:h-screen lg:grid-cols-12');
        expect(source).toContain('pt-[calc(5.75rem+env(safe-area-inset-top))]');
        expect(source).toContain('min-h-[calc(100dvh_-_5.75rem_-_env(safe-area-inset-top))]');
        expect(source).toContain('text-[clamp(4.5rem,31vw,18rem)]');
        expect(source).toContain('text-[clamp(1.25rem,6vw,2.25rem)]');
        expect(source).toContain('text-[clamp(4rem,17vw,6rem)]');
        expect(source).toContain('grid grid-cols-1 gap-4 w-full max-w-5xl sm:grid-cols-2');
        expect(source).toContain('flex min-h-[45dvh] flex-col');
    });

    it('respeta reduced-motion en animaciones del monitor público', () => {
        const source = readFileSync(
            join(process.cwd(), 'src/app/display/queue/page.tsx'),
            'utf8',
        );

        expect(source).toContain('useReducedMotion');
        expect(source).toContain('const shouldReduceMotion = useReducedMotion();');
        expect(source).toContain('recentTicketPulse');
        expect(source).toContain('pulseTransition');
        expect(source).toContain("shouldReduceMotion ? false");
        expect(source).toContain("shouldReduceMotion ? '' : 'animate-pulse'");
    });

    it('valida la sucursal persistida contra ubicaciones públicas antes de abrir DISPLAY', () => {
        const source = readFileSync(
            join(process.cwd(), 'src/app/display/queue/page.tsx'),
            'utf8',
        );

        expect(source).toContain('findAvailablePublicKioskLocation(res.data, savedLocId)');
        expect(source).toContain('clearStoredDisplayLocation()');
        expect(source).toContain("localStorage.removeItem('queue_display_location_id')");
    });
});
