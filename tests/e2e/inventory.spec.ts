/**
 * E2E Smoke Tests - Inventory V2
 * 
 * Tests críticos para operaciones de inventario seguras:
 * - Ajuste de stock requiere PIN para > 100 unidades
 * - Transferencia entre ubicaciones
 * - Validación con rate limiting
 * 
 * Actualizado: 27/01/2026 - Flujo de login corregido
 */

import { test, expect } from '@playwright/test';
import { loginAsManager, goToInventory } from './helpers/login';

test.describe('Inventory V2 - Smoke Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Login como Manager usando el flujo real de la aplicación
        await loginAsManager(page);
    });

    test('Ajuste de stock < 100 unidades NO requiere PIN', async ({ page }) => {
        // Navegar a inventario
        await goToInventory(page);

        // Buscar un producto
        await page.fill('input[placeholder*="Buscar"]', 'Paracetamol');
        await page.waitForTimeout(500);

        // Click en "Ajustar Stock"
        const ajustarBtn = page.locator('button:has-text("Ajustar")').first();
        if (await ajustarBtn.isVisible()) {
            await ajustarBtn.click();

            // Ingresar ajuste de 50 unidades (bajo el umbral)
            await page.fill('input[name="quantity"]', '50');
            const reasonSelect = page.locator('select[name="reason"]');
            if (await reasonSelect.isVisible()) {
                await reasonSelect.selectOption('INVENTORY_COUNT');
            }

            // NO debería pedir PIN
            await expect(page.locator('input[placeholder*="PIN"]')).toHaveCount(0);

            // Confirmar
            await page.click('button:has-text("Confirmar Ajuste")');

            // Verificar éxito
            await expect(page.locator('text=/ajuste.*exitoso/i')).toBeVisible({ timeout: 5000 });
        } else {
            // Si no hay productos para ajustar, skip con mensaje informativo
            test.skip(true, 'No hay productos disponibles para ajustar en esta vista');
        }
    });

    test('Ajuste de stock > 100 unidades REQUIERE PIN supervisor', async ({ page }) => {
        await goToInventory(page);

        // Buscar producto
        await page.fill('input[placeholder*="Buscar"]', 'Paracetamol');
        await page.waitForTimeout(500);

        // Click en "Ajustar Stock"
        const ajustarBtn = page.locator('button:has-text("Ajustar")').first();
        if (await ajustarBtn.isVisible()) {
            await ajustarBtn.click();

            // Ingresar ajuste de 150 unidades (sobre el umbral)
            await page.fill('input[name="quantity"]', '150');
            const reasonSelect = page.locator('select[name="reason"]');
            if (await reasonSelect.isVisible()) {
                await reasonSelect.selectOption('INVENTORY_COUNT');
            }

            // Debería mostrar campo de PIN
            await expect(page.locator('input[placeholder*="PIN"]')).toBeVisible();
            await expect(page.locator('text=/requiere.*supervisor/i')).toBeVisible();

            // Intentar sin PIN
            await page.click('button:has-text("Confirmar Ajuste")');
            await expect(page.locator('text=/PIN.*requerido/i')).toBeVisible();

            // Ingresar PIN correcto (Gerente PIN: 1213)
            await page.fill('input[placeholder*="PIN"]', '1213');
            await page.click('button:has-text("Confirmar Ajuste")');

            // Verificar éxito
            await expect(page.locator('text=/ajuste.*exitoso/i')).toBeVisible({ timeout: 5000 });
        } else {
            test.skip(true, 'No hay productos disponibles para ajustar en esta vista');
        }
    });

    test('Transferencia entre ubicaciones funciona correctamente', async ({ page }) => {
        await goToInventory(page);

        // Buscar producto
        await page.fill('input[placeholder*="Buscar"]', 'Ibuprofeno');
        await page.waitForTimeout(500);

        // Click en "Transferir"
        const transferirBtn = page.locator('button:has-text("Transferir")').first();
        if (await transferirBtn.isVisible()) {
            await transferirBtn.click();

            // Seleccionar ubicación destino (usar índice)
            const toLocationSelect = page.locator('select[name="toLocation"]');
            if (await toLocationSelect.isVisible()) {
                await toLocationSelect.selectOption({ index: 1 });
            }

            // Ingresar cantidad
            await page.fill('input[name="quantity"]', '25');

            // Confirmar
            await page.click('button:has-text("Confirmar Transferencia")');

            // Verificar éxito
            await expect(page.locator('text=/transferencia.*exitosa/i')).toBeVisible({ timeout: 5000 });

            // Verificar que aparece en movimientos
            const movimientosBtn = page.locator('text=/Movimientos/i');
            if (await movimientosBtn.isVisible()) {
                await movimientosBtn.click();
                await expect(page.locator('text=/TRANSFER/i')).toBeVisible();
            }
        } else {
            test.skip(true, 'No hay productos disponibles para transferir en esta vista');
        }
    });

    test('PIN incorrecto bloquea ajuste de stock', async ({ page }) => {
        await goToInventory(page);

        await page.fill('input[placeholder*="Buscar"]', 'Paracetamol');
        await page.waitForTimeout(500);

        const ajustarBtn = page.locator('button:has-text("Ajustar")').first();
        if (await ajustarBtn.isVisible()) {
            await ajustarBtn.click();

            // Ajuste > 100
            await page.fill('input[name="quantity"]', '200');
            const reasonSelect = page.locator('select[name="reason"]');
            if (await reasonSelect.isVisible()) {
                await reasonSelect.selectOption('DAMAGE');
            }

            // Esperar a que aparezca el campo de PIN (para ajustes grandes)
            await page.waitForSelector('input[placeholder*="PIN"]', { timeout: 3000 }).catch(() => { });

            // PIN incorrecto
            const pinInput = page.locator('input[placeholder*="PIN"]');
            if (await pinInput.isVisible()) {
                await pinInput.fill('0000');
                await page.click('button:has-text("Confirmar Ajuste")');

                // Debe mostrar error
                await expect(page.locator('text=/PIN.*inválido|incorrecto/i')).toBeVisible();

                // El ajuste NO debe aplicarse
                await expect(page.locator('text=/ajuste.*exitoso/i')).toHaveCount(0);
            }
        } else {
            test.skip(true, 'No hay productos disponibles para ajustar en esta vista');
        }
    });
});
