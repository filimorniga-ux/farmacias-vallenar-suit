import { describe, expect, it, vi } from 'vitest';

const { mockNotFound } = vi.hoisted(() => ({
    mockNotFound: vi.fn(() => {
        throw new Error('NEXT_NOT_FOUND');
    }),
}));

vi.mock('next/navigation', () => ({
    notFound: () => mockNotFound(),
}));

import LegacyCatchAllPage from '@/app/[...slug]/page';

describe('/app/[...slug]/page', () => {
    it('rechaza slugs desconocidos sin revivir el shell legacy', () => {
        expect(() => LegacyCatchAllPage()).toThrow('NEXT_NOT_FOUND');
        expect(mockNotFound).toHaveBeenCalledTimes(1);
    });
});
