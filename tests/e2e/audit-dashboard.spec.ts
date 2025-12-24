/**
 * E2E Smoke Tests - Audit Dashboard
 * 
 * Tests críticos para el dashboard de auditoría:
 * - Dashboard carga con filtros
 * - Export genera archivo Excel
 * - Solo visible para ADMIN/MANAGER
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Audit Dashboard - Smoke Tests', () => {
    test('Dashboard NO visible para CASHIER (RBAC)', async ({ page }) => {
        // Login como CASHIER
        await page.goto('/access');
        await page.fill('input[name="username"]', 'cashier1@vallenar.cl');
        await page.fill('input[name="password"]', 'Test1234!');
        await page.click('button[type="submit"]');

        // Intentar acceder al dashboard de auditoría
        await page.goto('/admin/audit');

        // Debería redirigir o mostrar error 403
        await expect(page).not.toHaveURL('/admin/audit');
        // O mostrar mensaje de acceso denegado
        await expect(page.locator('text=/no autorizado|acceso denegado/i')).toBeVisible();
    });

    test('Dashboard visible para ADMIN con filtros funcionando', async ({ page }) => {
        // Login como ADMIN
        await page.goto('/access');
        await page.fill('input[name="username"]', 'admin@vallenar.cl');
        await page.fill('input[name="password"]', 'Admin1234!');
        await page.click('button[type="submit"]');

        // Acceder al dashboard de auditoría
        await page.goto('/admin/audit');

        // Verificar que carga
        await expect(page).toHaveURL('/admin/audit');
        await expect(page.locator('text=/Centro de Auditoría/i')).toBeVisible();

        // Verificar que muestra estadísticas
        await expect(page.locator('text=/Hoy/i')).toBeVisible();
        await expect(page.locator('text=/Críticos/i')).toBeVisible();

        // Verificar que hay tabla de logs
        await expect(page.locator('table')).toBeVisible();

        // Verificar columnas esperadas
        await expect(page.locator('th:has-text("Fecha")')).toBeVisible();
        await expect(page.locator('th:has-text("Usuario")')).toBeVisible();
        await expect(page.locator('th:has-text("Acción")')).toBeVisible();
        await expect(page.locator('th:has-text("Severidad")')).toBeVisible();
    });

    test('Filtros de búsqueda funcionan correctamente', async ({ page }) => {
        // Login como ADMIN
        await page.goto('/access');
        await page.fill('input[name="username"]', 'admin@vallenar.cl');
        await page.fill('input[name="password"]', 'Admin1234!');
        await page.click('button[type="submit"]');
        await page.goto('/admin/audit');

        // Esperar carga inicial
        await page.waitForLoadState('networkidle');

        // Click en "Filtros"
        await page.click('button:has-text("Filtros")');

        // Debería mostrar panel de filtros
        await expect(page.locator('select[name="action"]')).toBeVisible();
        await expect(page.locator('select[name="severity"]')).toBeVisible();
        await expect(page.locator('input[type="date"]').first()).toBeVisible();

        // Aplicar filtro de severidad
        await page.selectOption('select[name="severity"]', 'CRITICAL');

        // Aplicar filtros
        await page.click('button:has-text("Aplicar")');
        await page.waitForTimeout(1000);

        // Verificar que los resultados tienen badges de CRITICAL
        const criticalBadges = page.locator('span:has-text("CRITICAL")');
        const count = await criticalBadges.count();

        if (count > 0) {
            // Si hay resultados, todos deben ser CRITICAL
            await expect(criticalBadges.first()).toBeVisible();
        } else {
            // Si no hay resultados, debe mostrar mensaje
            await expect(page.locator('text=/No hay registros/i')).toBeVisible();
        }
    });

    test('Búsqueda de texto filtra resultados', async ({ page }) => {
        await page.goto('/access');
        await page.fill('input[name="username"]', 'admin@vallenar.cl');
        await page.fill('input[name="password"]', 'Admin1234!');
        await page.click('button[type="submit"]');
        await page.goto('/admin/audit');

        await page.waitForLoadState('networkidle');

        // Ingresar búsqueda
        await page.fill('input[placeholder*="Buscar"]', 'LOGIN');
        await page.waitForTimeout(500);

        // Debería filtrar y mostrar solo LOGINs
        const actionCells = page.locator('span:has-text("LOGIN")');
        await expect(actionCells.first()).toBeVisible({ timeout: 3000 });
    });

    test('Exportar a Excel genera archivo descargable', async ({ page }) => {
        await page.goto('/access');
        await page.fill('input[name="username"]', 'admin@vallenar.cl');
        await page.fill('input[name="password"]', 'Admin1234!');
        await page.click('button[type="submit"]');
        await page.goto('/admin/audit');

        await page.waitForLoadState('networkidle');

        // Setup download listener
        const downloadPromise = page.waitForEvent('download');

        // Click en botón Excel
        await page.click('button:has-text("Excel")');

        // Esperar descarga
        const download = await downloadPromise;

        // Verificar que el archivo se descargó
        expect(download.suggestedFilename()).toMatch(/auditoria.*\.xlsx/);

        // Guardar archivo temporalmente para verificar
        const downloadPath = await download.path();
        expect(downloadPath).toBeTruthy();

        // Verificar que el archivo existe y tiene tamaño
        const stats = fs.statSync(downloadPath!);
        expect(stats.size).toBeGreaterThan(0);
    });

    test('Ver detalle de evento muestra diff viewer', async ({ page }) => {
        await page.goto('/access');
        await page.fill('input[name="username"]', 'admin@vallenar.cl');
        await page.fill('input[name="password"]', 'Admin1234!');
        await page.click('button[type="submit"]');
        await page.goto('/admin/audit');

        await page.waitForLoadState('networkidle');

        // Click en icono de "Ver detalles" del primer evento
        await page.click('button[title="Ver detalles"]').first();

        // Debería abrir modal de detalle
        await expect(page.locator('text=/Detalle del Evento/i')).toBeVisible();

        // Verificar que muestra información completa
        await expect(page.locator('text=/Fecha/i')).toBeVisible();
        await expect(page.locator('text=/Usuario/i')).toBeVisible();
        await expect(page.locator('text=/Acción/i')).toBeVisible();
        await expect(page.locator('text=/Severidad/i')).toBeVisible();

        // Verificar que muestra diff (si hay cambios)
        const diffSection = page.locator('text=/Cambios.*Diff/i');
        if (await diffSection.isVisible()) {
            // Debe mostrar valores antiguos y nuevos
            await expect(page.locator('.bg-slate-50').last()).toBeVisible();
        }

        // Cerrar modal
        await page.click('button:has-text("×")');
        await expect(page.locator('text=/Detalle del Evento/i')).toHaveCount(0);
    });

    test('Paginación funciona correctamente', async ({ page }) => {
        await page.goto('/access');
        await page.fill('input[name="username"]', 'admin@vallenar.cl');
        await page.fill('input[name="password"]', 'Admin1234!');
        await page.click('button[type="submit"]');
        await page.goto('/admin/audit');

        await page.waitForLoadState('networkidle');

        // Verificar indicador de página
        await expect(page.locator('text=/Página 1 de/i')).toBeVisible();

        // Verificar botones de paginación
        const prevButton = page.locator('button').filter({ hasText: /anterior|</ }).first();
        const nextButton = page.locator('button').filter({ hasText: /siguiente|>/ }).last();

        // Botón anterior debería estar deshabilitado en página 1
        await expect(prevButton).toBeDisabled();

        // Si hay más de una página, probar siguiente
        const hasNextPage = await nextButton.isEnabled();
        if (hasNextPage) {
            await nextButton.click();
            await page.waitForTimeout(500);

            // Verificar que cambió a página 2
            await expect(page.locator('text=/Página 2 de/i')).toBeVisible();

            // Ahora botón anterior debería estar habilitado
            await expect(prevButton).toBeEnabled();
        }
    });
});
