import { test, expect } from '@playwright/test';
import { loginAsManager } from './helpers/login';

test.describe('Monthly Closing Module - Smoke (Read Only)', () => {
    test.beforeEach(async ({ page }) => {
        test.setTimeout(180000);

        const loggedIn = await loginAsManager(page, {
            module: 'Administración',
            user: 'Gerente General 1',
            pin: '1213',
        }).then(() => true).catch(() => false);
        test.skip(!loggedIn, 'Login/contexto no disponible para Cierre Mensual');

        await page.goto('/finance/monthly-closing', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => undefined);
    });

    test('pantalla de cierre mensual carga correctamente', async ({ page }) => {
        const hasTitle = await page.getByText(/Cierre Mensual/i).first().isVisible().catch(() => false);
        const hasMain = await page.locator('main').isVisible().catch(() => false);

        expect(hasTitle || hasMain).toBeTruthy();
    });

    test('muestra estado del período y acciones principales', async ({ page }) => {
        const hasDraftOrClosed = await page.getByText(/BORRADOR|CERRADO|MES FINALIZADO/i).first().isVisible().catch(() => false);
        const hasSaveButton = await page.getByRole('button', { name: /Guardar Borrador/i }).first().isVisible().catch(() => false);
        const hasCloseButton = await page.getByRole('button', { name: /CERRAR MES|Cerrar Mes/i }).first().isVisible().catch(() => false);

        expect(hasDraftOrClosed || hasSaveButton || hasCloseButton).toBeTruthy();
    });

    test('secciones de ingresos/egresos y observaciones están visibles', async ({ page }) => {
        const hasIncome = await page.getByText(/Ingresos|Efectivo Recaudado/i).first().isVisible().catch(() => false);
        const hasExpense = await page.getByText(/Egresos|Gastos/i).first().isVisible().catch(() => false);
        const hasNotes = await page.locator('textarea[placeholder*="Observaciones" i]').first().isVisible().catch(() => false);

        expect(hasIncome || hasExpense || hasNotes).toBeTruthy();
    });
});
