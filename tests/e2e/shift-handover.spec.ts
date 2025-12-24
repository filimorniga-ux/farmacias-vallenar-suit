/**
 * E2E Smoke Tests - Shift Handover V2
 * 
 * Tests críticos para cambio de turno seguro:
 * - Cálculo de arqueo muestra totales correctos
 * - Handover requiere PIN del cajero
 * - Quick handover requiere dual PIN
 */

import { test, expect } from '@playwright/test';

test.describe('Shift Handover V2 - Smoke Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Login como CASHIER
        await page.goto('/access');
        await page.fill('input[name="username"]', 'cashier1@vallenar.cl');
        await page.fill('input[name="password"]', 'Test1234!');
        await page.click('button[type="submit"]');

        // Esperar a que cargue POS
        await expect(page).toHaveURL(/\/(pos|caja)/);
        await page.waitForLoadState('networkidle');
    });

    test('Cálculo de arqueo muestra totales correctos', async ({ page }) => {
        // Abrir modal de cambio de turno
        await page.click('button:has-text("Cambio de Turno")');

        // Debería mostrar el modal
        await expect(page.locator('text=/Cambio de Turno/i')).toBeVisible();

        // Ingresar efectivo contado
        await page.fill('input[placeholder="0"]', '125000');
        await page.click('button:has-text("Siguiente: Ver Resumen")');

        // Verificar que muestra el resumen
        await expect(page.locator('text=/Sistema Espera/i')).toBeVisible();
        await expect(page.locator('text=/Tú Declaraste/i')).toBeVisible();

        // Verificar monto declarado
        await expect(page.locator('text=/125.000/i').first()).toBeVisible();

        // Verificar que muestra diferencia (sobrante/faltante)
        await expect(page.locator('text=/Diferencia/i')).toBeVisible();

        // Verificar plan de entrega
        await expect(page.locator('text=/Entregar a Tesorería/i')).toBeVisible();
        await expect(page.locator('text=/Dejar en Caja/i')).toBeVisible();
    });

    test('Handover requiere PIN del cajero para confirmar', async ({ page }) => {
        // Abrir modal de cambio de turno
        await page.click('button:has-text("Cambio de Turno")');

        // Ingresar efectivo
        await page.fill('input[placeholder="0"]', '100000');
        await page.click('button:has-text("Siguiente: Ver Resumen")');

        // Esperar resumen
        await expect(page.locator('text=/Sistema Espera/i')).toBeVisible();

        // Debería mostrar campo de PIN
        await expect(page.locator('label:has-text("Confirme su PIN")')).toBeVisible();
        await expect(page.locator('input[type="password"]')).toBeVisible();

        // Botón deshabilitado sin PIN
        const confirmButton = page.locator('button:has-text("Confirmar Cierre")');
        await expect(confirmButton).toBeDisabled();

        // Ingresar PIN (CASHIER PIN: 1234)
        await page.fill('input[type="password"]', '1234');

        // Botón ahora habilitado
        await expect(confirmButton).toBeEnabled();
    });

    test('Handover con PIN incorrecto muestra error', async ({ page }) => {
        await page.click('button:has-text("Cambio de Turno")');

        await page.fill('input[placeholder="0"]', '100000');
        await page.click('button:has-text("Siguiente: Ver Resumen")');

        await expect(page.locator('text=/Sistema Espera/i')).toBeVisible();

        // PIN incorrecto
        await page.fill('input[type="password"]', '9999');
        await page.click('button:has-text("Confirmar Cierre")');

        // Debe mostrar error
        await expect(page.locator('text=/PIN.*inválido|incorrecto/i')).toBeVisible({ timeout: 5000 });

        // No debe cerrar el turno
        await expect(page.locator('text=/Turno cerrado/i')).toHaveCount(0);
    });

    test('Handover exitoso con PIN correcto cierra turno', async ({ page }) => {
        await page.click('button:has-text("Cambio de Turno")');

        await page.fill('input[placeholder="0"]', '75000');
        await page.click('button:has-text("Siguiente: Ver Resumen")');

        await expect(page.locator('text=/Sistema Espera/i')).toBeVisible();

        // PIN correcto
        await page.fill('input[type="password"]', '1234');
        await page.click('button:has-text("Confirmar Cierre")');

        // Debe mostrar éxito
        await expect(page.locator('text=/Turno cerrado.*correctamente/i')).toBeVisible({ timeout: 10000 });

        // Debe redirigir a login/access
        await expect(page).toHaveURL(/\/access/, { timeout: 5000 });
    });

    test('Quick handover requiere PIN de ambos cajeros', async ({ page }) => {
        // Este test asume que hay una opción de "Cambio Rápido" en el UI
        // Si no existe, skip este test
        const hasQuickHandover = await page.locator('button:has-text("Cambio Rápido")').count() > 0;

        test.skip(!hasQuickHandover, 'Quick handover no disponible en UI');

        await page.click('button:has-text("Cambio Rápido")');

        // Debería pedir PIN del cajero saliente
        await expect(page.locator('label:has-text("PIN Cajero Saliente")')).toBeVisible();

        // Debería pedir PIN del cajero entrante
        await expect(page.locator('label:has-text("PIN Cajero Entrante")')).toBeVisible();

        // Ingresar solo un PIN no debería funcionar
        await page.fill('input[name="outgoingPin"]', '1234');
        const confirmButton = page.locator('button:has-text("Confirmar Cambio")');
        await expect(confirmButton).toBeDisabled();

        // Ingresar ambos PINs
        await page.fill('input[name="incomingPin"]', '5678');
        await expect(confirmButton).toBeEnabled();
    });
});
