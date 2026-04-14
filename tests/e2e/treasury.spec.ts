import { test, expect } from '@playwright/test';
import { loginAsManager } from './helpers/login';
import { DEV_TEST_LOGIN } from '../support/dev-test-account';

test.describe('Treasury - Release Critical', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsManager(page, {
            branch: 'Farmacia Centro',
            module: 'Administración',
            user: DEV_TEST_LOGIN.user,
            pin: DEV_TEST_LOGIN.pin,
            strictBranchMatch: true,
            strictUserMatch: true,
        });
        await page.goto('/finance/treasury', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => undefined);
    });

    test('tesorería expone superficie principal y control estable', async ({ page }) => {
        await expect(page).toHaveURL(/\/finance\/treasury(?:\/|$)/i);
        await expect(page.getByTestId('treasury-page')).toBeVisible();
        await expect(page.getByTestId('treasury-history-tab')).toBeVisible();
        await expect(page.getByTestId('treasury-register-outflow')).toBeVisible();
    });
});
