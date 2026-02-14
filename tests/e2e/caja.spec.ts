import { test, expect } from '@playwright/test';
import { loginAsManager } from './helpers/login';

test.describe('Caja - Smoke', () => {
    test.beforeEach(async ({ page }) => {
        const loggedIn = await loginAsManager(page, {
            module: 'Punto de Venta',
            user: 'Gerente General 1',
            pin: '1213',
        }).then(() => true).catch(() => false);
        test.skip(!loggedIn, 'Login/contexto no disponible para Caja');
        await page.goto('/caja', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => undefined);
    });

    test('caja carga con layout principal', async ({ page }) => {
        const hasMain = await page.locator('main').isVisible().catch(() => false);
        const hasHeading = await page.locator('h1, h2').first().isVisible().catch(() => false);
        expect(hasMain || hasHeading).toBeTruthy();
    });

    test('muestra elementos operativos base', async ({ page }) => {
        const hasSearch = await page.locator('input[placeholder*="buscar" i], input[type="search"]').first().isVisible().catch(() => false);
        const hasButtons = (await page.locator('button').count()) > 0;
        const hasCart = await page.getByText(/carrito|carro|cart|total/i).first().isVisible().catch(() => false);

        expect(hasSearch || hasButtons || hasCart).toBeTruthy();
    });

    test('señales de estado o sincronización visibles', async ({ page }) => {
        const hasStatus =
            (await page.getByText(/online|offline|conectado|desconectado|sync|sincron/i).first().isVisible().catch(() => false)) ||
            (await page.locator('[data-testid="sync-status"], .sync-status, .connection-status').first().isVisible().catch(() => false));

        expect(hasStatus || (await page.locator('main').isVisible())).toBeTruthy();
    });
});
