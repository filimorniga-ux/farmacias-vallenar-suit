import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('/app/admin/cost-monitor mobile controls', () => {
    it('mantiene tabs, filtros y acciones con targets táctiles mínimos', () => {
        const source = readFileSync(
            join(process.cwd(), 'src/app/admin/cost-monitor/page.tsx'),
            'utf8',
        );

        expect(source).toContain('aria-label="Actualizar datos" className="min-h-11 min-w-11');
        expect(source).toContain('flex min-h-11 items-center gap-1.5 px-3 py-2');
        expect(source).toContain('min-h-11 px-3 py-1.5 rounded-lg text-xs');
        expect(source).toContain('min-h-11 px-2.5 py-1 rounded-lg text-[10px]');
        expect(source).toContain('flex min-h-11 items-center gap-1.5 px-3 py-1.5');
        expect(source).toContain('flex min-h-11 items-center gap-1.5 px-4 py-2');
    });

    it('alinea tabs globales de pricing con roles permitidos por el servidor', () => {
        const pageSource = readFileSync(
            join(process.cwd(), 'src/app/admin/cost-monitor/page.tsx'),
            'utf8',
        );
        const nextSidebarSource = readFileSync(
            join(process.cwd(), 'src/presentation/layouts/NextSidebarLayout.tsx'),
            'utf8',
        );
        const legacySidebarSource = readFileSync(
            join(process.cwd(), 'src/presentation/layouts/SidebarLayout.tsx'),
            'utf8',
        );

        expect(pageSource).toContain("PRICING_GLOBAL_UI_ROLES = new Set(['QF', 'ADMIN', 'GERENTE_GENERAL'])");
        expect(pageSource).toContain('canUseGlobalPricing ? getPendingRecommendations()');
        expect(pageSource).toContain("activeTab === 'recommendations' || activeTab === 'suppliers'");
        expect(nextSidebarSource).toContain("roles: ['MANAGER', 'QF', 'ADMIN', 'GERENTE_GENERAL']");
        expect(legacySidebarSource).toContain("roles: ['MANAGER', 'QF', 'ADMIN', 'GERENTE_GENERAL']");
    });
});
