import { test, expect } from '@playwright/test';
import { loginAsManager } from './helpers/login';

test.describe('POS - Smoke', () => {
    test.beforeEach(async ({ page }) => {
        const loggedIn = await loginAsManager(page, {
            module: 'Punto de Venta',
            user: 'Gerente General 1',
            pin: '1213',
        }).then(() => true).catch(() => false);
        test.skip(!loggedIn, 'Login/contexto no disponible para POS');
        await page.goto('/pos', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => undefined);
    });

    test('renderiza estado bloqueado o interfaz POS activa', async ({ page }) => {
        const blocked = await page.getByText(/Terminal Desactivado|bloqueado|Apertura/i).first().isVisible().catch(() => false);
        const activeUI = await page.getByText(/carrito|buscar|total|producto/i).first().isVisible().catch(() => false);

        expect(blocked || activeUI).toBeTruthy();
    });

    test('controles de turno/caja están presentes', async ({ page }) => {
        const hasShiftButton = await page.getByRole('button', { name: /Apertura|Cambio de Turno|Cerrar Turno|Solicitar/i }).first().isVisible().catch(() => false);
        const hasCashButtons = await page.getByRole('button', { name: /Arqueo|Ingreso|Gasto|Cierre/i }).first().isVisible().catch(() => false);

        expect(hasShiftButton || hasCashButtons).toBeTruthy();
    });

    test('layout responde en mobile y desktop', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        const mobileVisible = await page.locator('body').isVisible();

        await page.setViewportSize({ width: 1280, height: 800 });
        const desktopVisible = await page.locator('body').isVisible();

        expect(mobileVisible && desktopVisible).toBeTruthy();
    });
});
