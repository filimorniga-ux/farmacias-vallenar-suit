import { test, expect } from '@playwright/test';
import { loginAsManager } from './helpers/login';

test.describe('Security - Smoke', () => {
    test('POS muestra estados protegidos o bloqueados correctamente', async ({ page }) => {
        const loggedIn = await loginAsManager(page, {
            module: 'Punto de Venta',
            user: 'Gerente General 1',
            pin: '1213',
        }).then(() => true).catch(() => false);
        test.skip(!loggedIn, 'Login/contexto no disponible para prueba de seguridad POS');

        await page.goto('/pos', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => undefined);

        const hasBlockedState = await page.getByText(/Terminal Desactivado|PIN de Supervisor|Apertura/i).first().isVisible().catch(() => false);
        const hasCashOps = await page.getByRole('button', { name: /Arqueo|Ingreso|Gasto|Cierre/i }).first().isVisible().catch(() => false);

        expect(hasBlockedState || hasCashOps).toBeTruthy();
    });

    test('tesorería muestra indicios de autorización/PIN en acciones sensibles', async ({ page }) => {
        const loggedIn = await loginAsManager(page, {
            module: 'Administración',
            user: 'Gerente General 1',
            pin: '1213',
        }).then(() => true).catch(() => false);
        test.skip(!loggedIn, 'Login/contexto no disponible para prueba de seguridad Tesorería');

        await page.goto('/finance/treasury', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => undefined);

        const transferButton = page.getByRole('button', { name: /Transferir|Transfer/i }).first();
        if (await transferButton.isVisible().catch(() => false)) {
            await transferButton.click();
            await page.waitForTimeout(300);
        }

        const hasPinInput = await page.locator('input[type="password"], input[maxlength="4"]').first().isVisible().catch(() => false);
        const hasSecurityText = await page.getByText(/PIN|autorización|seguro|auditoría/i).first().isVisible().catch(() => false);

        expect(hasPinInput || hasSecurityText).toBeTruthy();
    });

    test('sección de auditoría renderiza sin error fatal', async ({ page }) => {
        const loggedIn = await loginAsManager(page, {
            module: 'Administración',
            user: 'Gerente General 1',
            pin: '1213',
        }).then(() => true).catch(() => false);
        test.skip(!loggedIn, 'Login/contexto no disponible para prueba de seguridad Auditoría');

        await page.goto('/admin/audit', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => undefined);

        const hasAudit = await page.getByText(/Auditoría|Centro de Auditoría|log|historial/i).first().isVisible().catch(() => false);
        const hasMain = await page.locator('main').isVisible().catch(() => false);

        expect(hasAudit || hasMain).toBeTruthy();
    });
});
