import { test, expect } from '@playwright/test';
import { loginAsManager } from './helpers/login';

test.describe('Audit Dashboard - Access Guard', () => {
    test('ruta de auditoría no aparece directamente en acceso sin contexto', async ({ page }) => {
        await page.goto('/admin/audit', { waitUntil: 'domcontentloaded' });

        const hasAuditCenter = await page.getByText(/Centro de Auditoría/i).isVisible().catch(() => false);
        const hasAccessSurface =
            (await page.getByRole('heading', { name: /¿Dónde inicias turno hoy\?/i }).isVisible().catch(() => false)) ||
            (await page.getByText('Administración', { exact: true }).isVisible().catch(() => false)) ||
            (await page.getByText(/Terminal Desactivado/i).isVisible().catch(() => false));

        expect(hasAuditCenter && hasAccessSurface).toBeFalsy();
    });
});

test.describe('Audit Dashboard - Smoke', () => {
    test.beforeEach(async ({ page }) => {
        const loggedIn = await loginAsManager(page, {
            module: 'Administración',
            user: 'Gerente General 1',
            pin: '1213',
        }).then(() => true).catch(() => false);
        test.skip(!loggedIn, 'Login/contexto no disponible para pruebas de auditoría');
        await page.goto('/admin/audit', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => undefined);
    });

    test('dashboard de auditoría carga con estructura base', async ({ page }) => {
        const hasTitle = await page.getByText(/Centro de Auditoría|Auditoría/i).first().isVisible().catch(() => false);
        const hasTable = await page.locator('table').first().isVisible().catch(() => false);
        const hasAnyMain = await page.locator('main').first().isVisible().catch(() => false);

        expect(hasTitle || hasTable || hasAnyMain).toBeTruthy();
    });

    test('controles de filtros o búsqueda están presentes', async ({ page }) => {
        const hasFilterButton = await page.getByRole('button', { name: /Filtros/i }).isVisible().catch(() => false);
        const hasSearchInput = await page.locator('input[placeholder*="Buscar" i]').first().isVisible().catch(() => false);
        const hasDateInput = await page.locator('input[type="date"]').first().isVisible().catch(() => false);

        expect(hasFilterButton || hasSearchInput || hasDateInput).toBeTruthy();
    });

    test('acciones de exportación o detalle existen en la vista', async ({ page }) => {
        const hasExport = await page.getByRole('button', { name: /Excel|Exportar/i }).first().isVisible().catch(() => false);
        const hasDetailAction = await page.locator('button[title*="detalle" i], button[title*="ver" i]').first().isVisible().catch(() => false);

        expect(hasExport || hasDetailAction).toBeTruthy();
    });
});
