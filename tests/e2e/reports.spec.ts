import { test, expect } from '@playwright/test';
import { loginAsManager } from './helpers/login';
import { DEV_TEST_LOGIN } from '../support/dev-test-account';

test.describe('Reports - Release Critical', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsManager(page, {
            branch: 'Farmacia Centro',
            module: 'Administración',
            user: DEV_TEST_LOGIN.user,
            pin: DEV_TEST_LOGIN.pin,
            strictBranchMatch: true,
            strictUserMatch: true,
        });
    });

    test('/reports carga directo con tabs principales', async ({ page }) => {
        await page.goto('/reports', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => undefined);

        await expect(page).toHaveURL(/\/reports$/);
        await expect(page.getByTestId('reports-page')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Flujo de Caja', exact: true }).first()).toBeVisible();
        await expect(page.getByTestId('reports-sales-by-product-button')).toBeVisible();
    });

    test('navega desde /reports a /reports/sales-by-product sin router legacy', async ({ page }) => {
        await page.goto('/reports', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => undefined);

        const productSalesButton = page.getByTestId('reports-sales-by-product-button');
        await productSalesButton.click();
        await page.waitForLoadState('networkidle').catch(() => undefined);

        await expect(page).toHaveURL(/\/reports\/sales-by-product$/);
        await expect(page.getByTestId('product-sales-report-page')).toBeVisible();
    });

    test('/reports/sales-by-product carga directo como subruta independiente', async ({ page }) => {
        await page.goto('/reports/sales-by-product', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => undefined);

        await expect(page).toHaveURL(/\/reports\/sales-by-product$/);
        await expect(page.getByTestId('product-sales-report-page')).toBeVisible();
        await expect(page.getByRole('button', { name: /Volver a reportes/i }).first()).toBeVisible();
    });
});
