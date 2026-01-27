/**
 * E2E Test Helpers - Login Flow
 * 
 * Helper reutilizable para el flujo de login real de la aplicación.
 * Actualizado: 27/01/2026
 * 
 * Flujo real:
 * 1. Seleccionar sucursal (Santiago)
 * 2. Click en ACCEDER (módulo)
 * 3. Seleccionar usuario (ej: Gerente General 1)
 * 4. Ingresar PIN
 */

import { Page, expect } from '@playwright/test';

export interface LoginOptions {
    branch?: string;          // Default: 'Farmacia Vallenar santiago'
    module?: string;          // Default: 'Administración' (primer módulo)
    user?: string;            // Default: 'Gerente General 1'
    pin?: string;             // Default: '1213'
}

/**
 * Login como Gerente General (rol con permisos amplios)
 */
export async function loginAsManager(page: Page, options?: LoginOptions) {
    const {
        branch = 'Farmacia Vallenar santiago',
        module = 'ACCEDER',
        user = 'Gerente General 1',
        pin = '1213'
    } = options || {};

    // 1. Ir a la página inicial
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // 2. Seleccionar sucursal
    const branchBtn = page.locator(`button:has-text("${branch}")`).first();

    // Esperar a que cargue la lista de sucursales (o cards con "Seleccionar")
    try {
        await page.waitForSelector('button:has-text("Seleccionar")', { timeout: 60000 });
    } catch (e) {
        // Un reintento suave por si la app tarda en hidratar
        await page.waitForTimeout(2000);
        await page.waitForSelector('button:has-text("Seleccionar")', { timeout: 20000 });
    }

    if (await branchBtn.count()) {
        await branchBtn.click();
    } else {
        // Fallback: elegir la primera sucursal disponible
        const fallbackBranch = page.locator('button:has-text("Seleccionar")').first();
        await fallbackBranch.click();
    }

    // 3. Esperar a que cargue el dashboard de módulos
    await page.waitForLoadState('networkidle');

    // 4. Click en ACCEDER (primer módulo disponible)
    const accederBtn = page.locator(`button:has-text("${module}")`).first();
    await accederBtn.waitFor({ state: 'visible', timeout: 10000 });
    await accederBtn.click();

    // 5. Esperar modal de login
    await page.waitForSelector('text=Iniciar Sesión', { timeout: 5000 });

    // 6. Seleccionar usuario
    await page.click(`text=${user}`);

    // 7. Ingresar PIN
    await page.fill('input[type="password"]', pin);

    // 8. Click en Entrar
    await page.click('button:has-text("Entrar")');

    // 9. Esperar a que cargue el dashboard
    await expect(page).toHaveURL(/.*dashboard.*/, { timeout: 15000 });

    // 10. Esperar a que la página esté lista
    await page.waitForLoadState('networkidle');
}

/**
 * Login como Cajero (rol limitado)
 */
export async function loginAsCashier(page: Page) {
    await loginAsManager(page, {
        user: 'Cajero 1',
        pin: '1234' // Ajustar según PIN real del cajero
    });
}

/**
 * Cerrar sesión desde cualquier página
 */
export async function logout(page: Page) {
    // Buscar botón de logout en sidebar o header
    const logoutBtn = page.locator('button:has-text("Cerrar Sesión"), button:has-text("Salir"), [data-testid="logout"]').first();
    if (await logoutBtn.isVisible()) {
        await logoutBtn.click();
        await page.waitForURL('**/');
    }
}

/**
 * Navegar a logística/inventario después del login
 */
export async function goToInventory(page: Page) {
    await page.goto('/logistica/inventory');
    await page.waitForLoadState('networkidle');
}

/**
 * Navegar a caja después del login
 */
export async function goToCaja(page: Page) {
    await page.goto('/caja');
    await page.waitForLoadState('networkidle');
}
