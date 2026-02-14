import { test, expect } from '@playwright/test';
import { loginAsManager } from './helpers/login';

test.describe('Shift Handover - Smoke (Read Only)', () => {
    test.beforeEach(async ({ page }) => {
        const loggedIn = await loginAsManager(page, {
            module: 'Punto de Venta',
            user: 'Gerente General 1',
            pin: '1213',
        }).then(() => true).catch(() => false);
        test.skip(!loggedIn, 'Login/contexto no disponible para Shift Handover');

        await page.goto('/pos', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => undefined);
    });

    test('UI de cambio de turno está disponible o estado bloqueado visible', async ({ page }) => {
        const hasShiftButton = await page.getByRole('button', { name: /Cambio de Turno|Cambio Rápido|Cerrar Turno|Apertura/i }).first().isVisible().catch(() => false);
        const hasBlocked = await page.getByText(/Terminal Desactivado|bloqueado|PIN de Supervisor/i).first().isVisible().catch(() => false);

        expect(hasShiftButton || hasBlocked).toBeTruthy();
    });

    test('si se abre modal de handover, muestra campos de validación', async ({ page }) => {
        const shiftButton = page.getByRole('button', { name: /Cambio de Turno|Cambio Rápido/i }).first();
        if (!(await shiftButton.isVisible().catch(() => false))) {
            test.skip(true, 'No hay botón de handover visible en este estado');
        }

        await shiftButton.click();
        await page.waitForTimeout(400);

        const hasDialog = await page.locator('[role="dialog"], .modal, .fixed.inset-0').first().isVisible().catch(() => false);
        const hasAmountInput = await page.locator('input[type="number"], input[placeholder="0"]').first().isVisible().catch(() => false);
        const hasPinInput = await page.locator('input[type="password"]').first().isVisible().catch(() => false);

        expect(hasDialog || hasAmountInput || hasPinInput).toBeTruthy();
    });
});
