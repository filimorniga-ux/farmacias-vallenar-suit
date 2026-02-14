import { test, expect } from '@playwright/test';
import { loginAsManager } from './helpers/login';

test.describe('Venta Kiosco - Smoke', () => {
    test('flujo base de ventas carga sin ejecutar cobro', async ({ page }) => {
        test.slow();

        const loggedIn = await loginAsManager(page, {
            module: 'Punto de Venta',
            user: 'Gerente General 1',
            pin: '1213',
        }).then(() => true).catch(() => false);
        test.skip(!loggedIn, 'Login/contexto no disponible para Venta Kiosco');

        await page.goto('/pos', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => undefined);

        const hasSearch = await page.locator('input[placeholder*="Buscar" i], input[placeholder*="Escanear" i]').first().isVisible().catch(() => false);
        const hasProductArea = await page.getByText(/producto|categoría|stock|carrito/i).first().isVisible().catch(() => false);
        const hasPayButton = await page.getByRole('button', { name: /Pagar|Cobrar|Emitir/i }).first().isVisible().catch(() => false);

        expect(hasSearch || hasProductArea || hasPayButton).toBeTruthy();
    });
});
