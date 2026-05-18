import { describe, expect, it, vi } from 'vitest';

const { mockNotFound } = vi.hoisted(() => ({
    mockNotFound: vi.fn(() => {
        throw new Error('NEXT_NOT_FOUND');
    }),
}));

vi.mock('next/navigation', () => ({
    notFound: () => mockNotFound(),
}));

import DeprecatedTotemPage from '@/app/_totem_deprecated/page';

describe('/app/_totem_deprecated/page', () => {
    it('retira la superficie pública deprecated con notFound', () => {
        expect(() => DeprecatedTotemPage()).toThrow('NEXT_NOT_FOUND');
        expect(mockNotFound).toHaveBeenCalledTimes(1);
    });
});
