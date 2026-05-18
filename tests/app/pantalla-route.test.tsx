import { describe, expect, it, vi } from 'vitest';

const { mockNotFound } = vi.hoisted(() => ({
    mockNotFound: vi.fn(() => {
        throw new Error('NEXT_NOT_FOUND');
    }),
}));

vi.mock('next/navigation', () => ({
    notFound: () => mockNotFound(),
}));

import PantallaPage from '@/app/pantalla/page';

describe('/app/pantalla/page', () => {
    it('retira la superficie publica legacy con notFound', () => {
        expect(() => PantallaPage()).toThrow('NEXT_NOT_FOUND');
        expect(mockNotFound).toHaveBeenCalledTimes(1);
    });
});
