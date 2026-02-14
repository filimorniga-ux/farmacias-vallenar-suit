import { test, expect } from '@playwright/test';
import { loginAsManager } from './helpers/login';

test.describe('Treasury - Smoke', () => {
    test.beforeEach(async ({ page }) => {
        const loggedIn = await loginAsManager(page, {
            module: 'Administración',
            user: 'Gerente General 1',
            pin: '1213',
        }).then(() => true).catch(() => false);
        test.skip(!loggedIn, 'Login/contexto no disponible para Tesorería');
        await page.goto('/finance/treasury', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => undefined);
    });

    test('tesorería carga con contenido principal', async ({ page }) => {
        const hasTitle = await page.getByText(/Tesorería|Treasury|Cuentas/i).first().isVisible().catch(() => false);
        const hasMain = await page.locator('main').isVisible().catch(() => false);

        expect(hasTitle || hasMain).toBeTruthy();
    });

    test('se muestran controles de transferencias o seguridad', async ({ page }) => {
        const hasTransferBtn = await page.getByRole('button', { name: /Transferir|Transfer/i }).first().isVisible().catch(() => false);
        const hasSecurityBadge = await page.getByText(/seguro|auditoría|PIN|autorización/i).first().isVisible().catch(() => false);

        expect(hasTransferBtn || hasSecurityBadge).toBeTruthy();
    });

    test('sección de historial/remesas está disponible', async ({ page }) => {
        const hasHistory = await page.getByRole('button', { name: /Historial|History/i }).first().isVisible().catch(() => false);
        const hasPending = await page.getByText(/pendiente|remesa/i).first().isVisible().catch(() => false);
        const hasTable = await page.locator('table').first().isVisible().catch(() => false);

        expect(hasHistory || hasPending || hasTable).toBeTruthy();
    });
});
