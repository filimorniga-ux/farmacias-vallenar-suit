import { test, expect } from '@playwright/test';
import { loginAsManager } from './helpers/login';
import { DEV_TEST_LOGIN } from '../support/dev-test-account';

test.describe('Login Flow', () => {
    test('login con credenciales válidas crea sesión y abre un módulo protegido', async ({ page }) => {
        test.setTimeout(120000);

        await loginAsManager(page, {
            branch: 'Farmacia Centro',
            module: 'Administración',
            user: DEV_TEST_LOGIN.user,
            pin: DEV_TEST_LOGIN.pin,
            strictBranchMatch: true,
            strictUserMatch: true,
        });

        await page.goto('/reports', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => undefined);

        await expect(page).toHaveURL(/\/reports(?:\/|$)/i);
        await expect(page.getByTestId('reports-page')).toBeVisible();
    });
});
