import { test, expect } from '@playwright/test';
import { loginAsManager } from './helpers/login';
import { DEV_TEST_LOGIN } from '../support/dev-test-account';

test.describe('POS - Release Critical', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsManager(page, {
            branch: 'Farmacia Centro',
            module: 'Administración',
            user: DEV_TEST_LOGIN.user,
            pin: DEV_TEST_LOGIN.pin,
            strictBranchMatch: true,
            strictUserMatch: true,
        });
        await page.goto('/pos', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => undefined);
    });

    test('POS expone un estado operativo seeded estable', async ({ page }) => {
        await expect(page).toHaveURL(/\/pos(?:\/|$)/i);
        await expect(page.getByTestId('caja-page')).toBeVisible();
        await expect(page.getByTestId('caja-status-closed')).toContainText('Caja Cerrada');
        await expect(page.getByTestId('caja-search-input')).toBeVisible();
        await expect(page.getByTestId('caja-confirm-payment')).toBeVisible();
    });
});
