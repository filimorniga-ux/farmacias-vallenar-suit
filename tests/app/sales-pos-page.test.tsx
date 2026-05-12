import { describe, expect, it, vi } from 'vitest';

const redirectMock = vi.fn((_: string) => {
    throw new Error('NEXT_REDIRECT');
});

vi.mock('next/navigation', () => ({
    redirect: (url: string) => redirectMock(url),
}));

import LegacySalesPosPage from '@/app/sales/pos/page';

describe('/app/sales/pos/page', () => {
    it('redirige el POS legacy al entrypoint canónico', () => {
        expect(() => LegacySalesPosPage()).toThrow('NEXT_REDIRECT');
        expect(redirectMock).toHaveBeenCalledWith('/pos');
    });
});
