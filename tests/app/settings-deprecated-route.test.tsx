import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRedirect } = vi.hoisted(() => ({
    mockRedirect: vi.fn((path: string) => {
        throw new Error(`NEXT_REDIRECT:${path}`);
    }),
}));

vi.mock('next/navigation', () => ({
    redirect: (path: string) => mockRedirect(path),
}));

import DeprecatedSettingsLayout from '@/app/settings_deprecated/layout';
import DeprecatedSettingsPage from '@/app/settings_deprecated/page';
import DeprecatedSettingsAiPage from '@/app/settings_deprecated/ai/page';
import DeprecatedSettingsAuditPage from '@/app/settings_deprecated/auditoria/page';
import DeprecatedSettingsOrganizationPage from '@/app/settings_deprecated/organization/page';

describe('/app/settings_deprecated routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('redirige el layout deprecated a configuración madura', () => {
        expect(() => DeprecatedSettingsLayout({ children: <div /> })).toThrow('NEXT_REDIRECT:/settings');
        expect(mockRedirect).toHaveBeenCalledWith('/settings');
    });

    it('redirige la raíz deprecated sin montar UI legacy', () => {
        expect(() => DeprecatedSettingsPage()).toThrow('NEXT_REDIRECT:/settings');
        expect(mockRedirect).toHaveBeenCalledWith('/settings');
    });

    it('redirige IA deprecated al tab canónico de configuración', () => {
        expect(() => DeprecatedSettingsAiPage()).toThrow('NEXT_REDIRECT:/settings?tab=ai');
        expect(mockRedirect).toHaveBeenCalledWith('/settings?tab=ai');
    });

    it('redirige auditoría deprecated sin importar cliente legacy', () => {
        expect(() => DeprecatedSettingsAuditPage()).toThrow('NEXT_REDIRECT:/settings');
        expect(mockRedirect).toHaveBeenCalledWith('/settings');
    });

    it('redirige organización deprecated sin montar gestor paralelo', () => {
        expect(() => DeprecatedSettingsOrganizationPage()).toThrow('NEXT_REDIRECT:/settings');
        expect(mockRedirect).toHaveBeenCalledWith('/settings');
    });
});
