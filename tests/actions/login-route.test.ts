import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server-session', () => ({
    invalidateCurrentSession: vi.fn(),
}));

import { GET } from '@/app/login/route';
import { invalidateCurrentSession } from '@/lib/server-session';

function createRequest(url: string) {
    const nextUrl = new URL(url);

    return {
        url,
        nextUrl,
    } as any;
}

describe('GET /login', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('invalida la sesión y redirige al home cuando no hay reason', async () => {
        const response = await GET(createRequest('http://localhost/login'));

        expect(invalidateCurrentSession).toHaveBeenCalledTimes(1);
        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe('http://localhost/');
    });

    it('preserva el reason al redirigir al home', async () => {
        const response = await GET(createRequest('http://localhost/login?reason=session_revoked'));

        expect(invalidateCurrentSession).toHaveBeenCalledTimes(1);
        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe('http://localhost/?reason=session_revoked');
    });
});
