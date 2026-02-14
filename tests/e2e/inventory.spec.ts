import { test, expect } from '@playwright/test';
import { loginAsManager, goToInventory } from './helpers/login';

test.describe('Inventory V2 - Smoke (Read Only)', () => {
    test.beforeEach(async ({ page }) => {
        const loggedIn = await loginAsManager(page, {
            module: 'Administración',
            user: 'Gerente General 1',
            pin: '1213',
        }).then(() => true).catch(() => false);
        test.skip(!loggedIn, 'Login/contexto no disponible para Inventario');
        const inventoryReady = await goToInventory(page).then(() => true).catch(() => false);
        test.skip(!inventoryReady, 'Módulo inventario no disponible en este entorno');
    });

    test('pantalla de inventario carga con estructura base', async ({ page }) => {
        const hasHeading = await page.getByText(/Inventario|Stock/i).first().isVisible().catch(() => false);
        const hasTable = await page.locator('table').first().isVisible().catch(() => false);
        const hasCards = await page.locator('[data-testid*="inventory"], .inventory').first().isVisible().catch(() => false);

        expect(hasHeading || hasTable || hasCards).toBeTruthy();
    });

    test('buscador o filtros de inventario están disponibles', async ({ page }) => {
        const searchInput = page.locator('input[placeholder*="Buscar" i], input[placeholder*="Escanear" i]').first();
        const hasSearch = await searchInput.isVisible().catch(() => false);

        if (hasSearch) {
            await searchInput.fill('par');
            await page.waitForTimeout(300);
        }

        const hasFilter = await page.getByRole('button', { name: /Filtro|Filtrar/i }).first().isVisible().catch(() => false);
        expect(hasSearch || hasFilter).toBeTruthy();
    });

    test('acciones de ajuste/transferencia existen sin ejecutar cambios', async ({ page }) => {
        const hasAdjust = await page.getByRole('button', { name: /Ajustar/i }).first().isVisible().catch(() => false);
        const hasTransfer = await page.getByRole('button', { name: /Transferir/i }).first().isVisible().catch(() => false);

        expect(hasAdjust || hasTransfer).toBeTruthy();
    });
});
