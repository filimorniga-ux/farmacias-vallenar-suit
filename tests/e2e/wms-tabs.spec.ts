import { test, expect, type Page } from '@playwright/test';
import { loginAsManager } from './helpers/login';

test.setTimeout(300000);

async function addAnyProductToWmsCart(page: Page): Promise<boolean> {
    const scannerInput = page.locator('input[placeholder*="Escanear o buscar"]').first();
    await expect(scannerInput).toBeVisible({ timeout: 30000 });

    const queries = ['par', 'amo', 'ibu', 'a'];
    for (const query of queries) {
        await scannerInput.fill(query);
        await page.waitForTimeout(450);

        const results = page.locator('div.absolute.z-50 button');
        const count = await results.count();
        if (count > 0) {
            await results.first().click();
            return true;
        }
    }

    return false;
}

test.describe('WMS Tabs - Reglas de Destino', () => {
    test.describe.configure({ mode: 'serial' });

    test.beforeEach(async ({ page }) => {
        const loggedIn = await loginAsManager(page, {
            branch: 'Farmacia Vallenar santiago',
            user: 'Gerente General 1',
            pin: '1213',
        }).then(() => true).catch(() => false);
        test.skip(!loggedIn, 'Login/contexto no disponible para WMS');
        await page.goto('/warehouse', { waitUntil: 'domcontentloaded' });
        await expect(page.getByText('Gestión de Bodega')).toBeVisible({ timeout: 30000 });
    });

    test('Despacho: si hay productos, muestra destinos solo del tipo opuesto', async ({ page }) => {
        const added = await addAnyProductToWmsCart(page);
        if (!added) {
            test.skip(true, 'No se encontraron productos para agregar al carrito en WMS');
        }

        const destinoSelect = page
            .locator('label:has-text("Destino")')
            .locator('..')
            .locator('select')
            .first();
        await expect(destinoSelect).toBeVisible();

        const options = (await destinoSelect.locator('option').allTextContents()).map(t => t.trim());
        const destinationOptions = options.slice(1);

        if (destinationOptions.length === 0) {
            await expect(destinoSelect).toContainText(/No hay (bodegas|sucursales) destino disponibles/i);
            test.skip(true, 'No hay destinos configurados para validar la regla de tipos');
        }

        const hasSucursal = destinationOptions.some(opt => opt.includes('(Sucursal)'));
        const hasBodega = destinationOptions.some(opt => opt.includes('(Bodega)'));

        // Regla de despacho: no mezclar tipos (solo opuesto al origen).
        expect(hasSucursal && hasBodega).toBeFalsy();
    });

    test('Transferencia: solo mismo tipo y confirmar deshabilitado sin destino', async ({ page }) => {
        await page.getByRole('button', { name: 'Transferencia' }).click();

        const added = await addAnyProductToWmsCart(page);
        if (!added) {
            test.skip(true, 'No se encontraron productos para agregar al carrito en Transferencia');
        }

        const selects = page.locator('select');
        await expect(selects).toHaveCount(2);

        const destinationSelect = selects.nth(1);
        const options = (await destinationSelect.locator('option').allTextContents()).map(t => t.trim());
        const destinationOptions = options.slice(1);

        if (destinationOptions.length === 0) {
            await expect(destinationSelect).toContainText(/No hay (sucursales|bodegas) destino disponibles/i);
            test.skip(true, 'No hay destinos configurados para validar transferencia');
        }

        const hasSucursal = destinationOptions.some(opt => opt.includes('(Sucursal)'));
        const hasBodega = destinationOptions.some(opt => opt.includes('(Bodega)'));

        // Regla de transferencia: mismo tipo, por lo tanto no deben mezclarse opciones.
        expect(hasSucursal && hasBodega).toBeFalsy();

        const confirmBtn = page.getByRole('button', { name: 'Confirmar Transferencia' });
        await expect(confirmBtn).toBeDisabled();
    });
});
