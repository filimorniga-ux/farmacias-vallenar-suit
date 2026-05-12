import { describe, expect, it, vi } from 'vitest';

const { redirectMock } = vi.hoisted(() => ({
    redirectMock: vi.fn((path: string) => {
        throw new Error(`REDIRECT:${path}`);
    }),
}));

vi.mock('next/navigation', () => ({
    redirect: redirectMock,
}));

import LegacyHrPage from '@/app/hr/page';

describe('/hr legacy alias', () => {
    it('redirige al destino App Router canónico de RRHH', () => {
        expect(() => LegacyHrPage()).toThrow('REDIRECT:/rrhh');
        expect(redirectMock).toHaveBeenCalledWith('/rrhh');
    });
});
