import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetValidatedSession, mockRedirect } = vi.hoisted(() => ({
    mockGetValidatedSession: vi.fn(),
    mockRedirect: vi.fn((_: string) => {
        throw new Error('NEXT_REDIRECT');
    }),
}));

vi.mock('next/navigation', () => ({
    redirect: (url: string) => mockRedirect(url),
}));

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: () => mockGetValidatedSession(),
}));

vi.mock('@/presentation/layouts/NextSidebarLayout', () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <div data-testid="admin-layout-shell">{children}</div>,
}));

import AdminLayout from '@/app/admin/layout';

describe('/app/admin/layout', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('redirige si no hay sesión', async () => {
        mockGetValidatedSession.mockResolvedValue(null);

        await expect(AdminLayout({ children: <div>admin</div> })).rejects.toThrow('NEXT_REDIRECT');
    });

    it('renderiza el shell para roles autorizados', async () => {
        mockGetValidatedSession.mockResolvedValue({
            userId: 'admin-1',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await AdminLayout({ children: <div>admin</div> });

        expect(mockRedirect).not.toHaveBeenCalled();
        expect((result as any).props.children.props.children).toBe('admin');
    });
});
