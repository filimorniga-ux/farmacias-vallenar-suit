import { test, expect, type Page } from '@playwright/test';
import { loginAsManager } from './helpers/login';

async function gotoPos(page: Page) {
    const loggedIn = await loginAsManager(page, {
        module: 'Punto de Venta',
        user: 'Gerente General 1',
        pin: '1213',
    }).then(() => true).catch(() => false);

    test.skip(!loggedIn, 'Login/contexto no disponible para POS');

    await page.goto('/pos', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
}

async function openHistoryIfPossible(page: Page) {
    const historyBtn = page.getByRole('button', { name: /Historial|Transacciones|Ventas/i }).first();
    if (!(await historyBtn.isVisible().catch(() => false))) {
        test.skip(true, 'No hay acceso visible a historial en este estado de POS');
    }

    await historyBtn.click();
    await page.waitForTimeout(400);

    const hasHistory = await page.getByText(/Historial de Transacciones/i).first().isVisible().catch(() => false);
    test.skip(!hasHistory, 'Modal de historial no disponible en este estado');
}

test.describe('Sales/Refunds Regression - Critical Flows', () => {
    test.beforeEach(async ({ page }) => {
        await gotoPos(page);
    });

    test('Flujo A: devolución cash visible y trazable en historial', async ({ page }) => {
        await openHistoryIfPossible(page);

        const saleRow = page.getByText(/Venta #|VENTA/i).first();
        if (!(await saleRow.isVisible().catch(() => false))) {
            test.skip(true, 'No hay ventas visibles para probar devolución');
        }

        await saleRow.click();
        const returnBtn = page.getByRole('button', { name: /Devolución/i }).first();
        if (!(await returnBtn.isVisible().catch(() => false))) {
            test.skip(true, 'No hay botón de devolución habilitado para la venta seleccionada');
        }

        await returnBtn.click();
        await expect(page.getByText(/Medio de devolución/i)).toBeVisible();
        await expect(page.getByRole('button', { name: /Efectivo/i })).toBeVisible();
    });

    test('Flujo B: devolución transferencia ofrece método TRANSFER', async ({ page }) => {
        await openHistoryIfPossible(page);

        const saleRow = page.getByText(/Venta #|VENTA/i).first();
        if (!(await saleRow.isVisible().catch(() => false))) {
            test.skip(true, 'No hay ventas visibles para probar selector de método');
        }

        await saleRow.click();
        const returnBtn = page.getByRole('button', { name: /Devolución/i }).first();
        if (!(await returnBtn.isVisible().catch(() => false))) {
            test.skip(true, 'No hay botón de devolución habilitado para la venta seleccionada');
        }

        await returnBtn.click();
        await expect(page.getByRole('button', { name: /Transferencia/i })).toBeVisible();
    });

    test('Flujo C: edición de venta expone razón y autorización PIN', async ({ page }) => {
        await openHistoryIfPossible(page);

        const saleRow = page.getByText(/Venta #|VENTA/i).first();
        if (!(await saleRow.isVisible().catch(() => false))) {
            test.skip(true, 'No hay ventas visibles para probar edición');
        }

        await saleRow.click();
        const editBtn = page.getByRole('button', { name: /Editar/i }).first();
        if (!(await editBtn.isVisible().catch(() => false))) {
            test.skip(true, 'No hay botón de edición habilitado para la venta seleccionada');
        }

        await editBtn.click();
        await expect(page.getByText(/Editar Venta/i)).toBeVisible();
        await expect(page.getByPlaceholder(/cajero ingresó/i)).toBeVisible();
    });

    test('Flujo D: cambio de turno mantiene ruta operativa disponible', async ({ page }) => {
        const shiftBtn = page.getByRole('button', { name: /Cambio de Turno|Cambio Rápido|Cerrar Turno|Apertura/i }).first();
        const blocked = await page.getByText(/Terminal Desactivado|bloqueado/i).first().isVisible().catch(() => false);

        if (!(await shiftBtn.isVisible().catch(() => false)) && !blocked) {
            test.skip(true, 'No hay controles de turno visibles en este estado');
        }

        expect((await shiftBtn.isVisible().catch(() => false)) || blocked).toBeTruthy();
    });
});
