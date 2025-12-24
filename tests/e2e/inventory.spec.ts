/**
 * E2E Smoke Tests - Inventory V2
 * 
 * Tests críticos para operaciones de inventario seguras:
 * - Ajuste de stock requiere PIN para > 100 unidades
 * - Transferencia entre ubicaciones
 * - Validación con rate limiting
 */

import { test, expect } from '@playwright/test';

test.describe('Inventory V2 - Smoke Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Login como MANAGER (tiene permisos para inventario)
        await page.goto('/access');
        await page.fill('input[name="username"]', 'manager@vallenar.cl');
        await page.fill('input[name="password"]', 'Test1234!');
        await page.click('button[type="submit"]');
        await expect(page).toHaveURL('/logistica');
    });

    test('Ajuste de stock < 100 unidades NO requiere PIN', async ({ page }) => {
        // Navegar a inventario
        await page.goto('/logistica/inventory');

        // Buscar un producto
        await page.fill('input[placeholder*="Buscar"]', 'Paracetamol');
        await page.waitForTimeout(500);

        // Click en "Ajustar Stock"
        await page.click('button:has-text("Ajustar")').first();

        // Ingresar ajuste de 50 unidades (bajo el umbral)
        await page.fill('input[name="quantity"]', '50');
        await page.selectOption('select[name="reason"]', 'INVENTORY_COUNT');

        // NO debería pedir PIN
        await expect(page.locator('input[placeholder*="PIN"]')).toHaveCount(0);

        // Confirmar
        await page.click('button:has-text("Confirmar Ajuste")');

        // Verificar éxito
        await expect(page.locator('text=/ajuste.*exitoso/i')).toBeVisible({ timeout: 5000 });
    });

    test('Ajuste de stock > 100 unidades REQUIERE PIN supervisor', async ({ page }) => {
        await page.goto('/logistica/inventory');

        // Buscar producto
        await page.fill('input[placeholder*="Buscar"]', 'Paracetamol');
        await page.waitForTimeout(500);

        // Click en "Ajustar Stock"
        await page.click('button:has-text("Ajustar")').first();

        // Ingresar ajuste de 150 unidades (sobre el umbral)
        await page.fill('input[name="quantity"]', '150');
        await page.selectOption('select[name="reason"]', 'INVENTORY_COUNT');

        // Debería mostrar campo de PIN
        await expect(page.locator('input[placeholder*="PIN"]')).toBeVisible();
        await expect(page.locator('text=/requiere.*supervisor/i')).toBeVisible();

        // Intentar sin PIN
        await page.click('button:has-text("Confirmar Ajuste")');
        await expect(page.locator('text=/PIN.*requerido/i')).toBeVisible();

        // Ingresar PIN correcto (MANAGER PIN: 5678)
        await page.fill('input[placeholder*="PIN"]', '5678');
        await page.click('button:has-text("Confirmar Ajuste")');

        // Verificar éxito
        await expect(page.locator('text=/ajuste.*exitoso/i')).toBeVisible({ timeout: 5000 });
    });

    test('Transferencia entre ubicaciones funciona correctamente', async ({ page }) => {
        await page.goto('/logistica/inventory');

        // Buscar producto
        await page.fill('input[placeholder*="Buscar"]', 'Ibuprofeno');
        await page.waitForTimeout(500);

        // Click en "Transferir"
        await page.click('button:has-text("Transferir")').first();

        // Seleccionar ubicación destino
        await page.selectOption('select[name="toLocation"]', { label: /Farmacia Central/i });

        // Ingresar cantidad
        await page.fill('input[name="quantity"]', '25');

        // Confirmar
        await page.click('button:has-text("Confirmar Transferencia")');

        // Verificar éxito
        await expect(page.locator('text=/transferencia.*exitosa/i')).toBeVisible({ timeout: 5000 });

        // Verificar que aparece en movimientos
        await page.click('text=/Movimientos/i');
        await expect(page.locator('text=/TRANSFER/i')).toBeVisible();
    });

    test('PIN incorrecto bloquea ajuste de stock', async ({ page }) => {
        await page.goto('/logistica/inventory');

        await page.fill('input[placeholder*="Buscar"]', 'Paracetamol');
        await page.waitForTimeout(500);

        await page.click('button:has-text("Ajustar")').first();

        // Ajuste > 100
        await page.fill('input[name="quantity"]', '200');
        await page.selectOption('select[name="reason"]', 'DAMAGE');

        // PIN incorrecto
        await page.fill('input[placeholder*="PIN"]', '0000');
        await page.click('button:has-text("Confirmar Ajuste")');

        // Debe mostrar error
        await expect(page.locator('text=/PIN.*inválido|incorrecto/i')).toBeVisible();

        // El ajuste NO debe aplicarse
        await expect(page.locator('text=/ajuste.*exitoso/i')).toHaveCount(0);
    });
});
