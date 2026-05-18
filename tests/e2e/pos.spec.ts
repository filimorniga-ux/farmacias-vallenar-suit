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

        const blockedState = page.getByTestId('pos-blocked-state');
        const mainScreen = page.getByTestId('pos-main-screen');
        const blockedVisible = await blockedState.isVisible().catch(() => false);
        const mainVisible = await mainScreen.isVisible().catch(() => false);

        expect(blockedVisible || mainVisible).toBeTruthy();
        if (blockedVisible) {
            await expect(blockedState).toContainText('Terminal Bloqueado');
            await expect(page.getByTestId('pos-request-open-shift')).toBeVisible();
        }
    });
});
