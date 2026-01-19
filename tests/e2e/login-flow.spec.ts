import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
    test('should login successfully with valid credentials and redirect to dashboard', async ({ page }) => {
        // Increase timeout for initial page load
        test.setTimeout(120000);

        // 1. Navigate to Landing Page - use domcontentloaded to avoid networkidle timeout
        await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Wait for React hydration and content to appear
        await page.waitForTimeout(5000);

        // 2. The app may show module cards or branch selection
        // Look for "Iniciar Sesión" card/button on home page
        const iniciarSesionCard = page.locator('text=Iniciar Sesión').first();

        if (await iniciarSesionCard.isVisible({ timeout: 10000 })) {
            await iniciarSesionCard.click();
            await page.waitForTimeout(1000);
        }

        // 3. Context Selection (Branch/Sucursal)
        // Page shows "¿Dónde inicias turno hoy?" with location cards
        // Look for "Farmacia Vallenar santiago" or just "Vallenar" or first SELECCIONAR button
        const vallenarOption = page.locator('text=Farmacia Vallenar santiago, text=Vallenar').first();
        const seleccionarBtn = page.locator('text=SELECCIONAR').first();

        try {
            if (await vallenarOption.isVisible({ timeout: 5000 })) {
                await vallenarOption.click();
            } else if (await seleccionarBtn.isVisible({ timeout: 3000 })) {
                await seleccionarBtn.click();
            }
            await page.waitForTimeout(2000);
        } catch {
            console.log('Branch selection step skipped');
        }

        // 4. After branch selection, we should see user selection or login form
        // Open Login if not already open - look for "Iniciar Sesión" again
        const loginButton = page.locator('text=Iniciar Sesión').first();
        if (await loginButton.isVisible({ timeout: 3000 })) {
            await loginButton.click();
            await page.waitForTimeout(1000);
        }

        // 5. Search and Select User - "Gerente General"
        const searchInput = page.locator('input[placeholder*="Buscar"]').first();
        if (await searchInput.isVisible({ timeout: 3000 })) {
            await searchInput.fill('Gerente General');
            await page.waitForTimeout(500);
        }

        // Click on "Gerente General" user
        const gerenteOption = page.locator('text=Gerente General').first();
        await expect(gerenteOption).toBeVisible({ timeout: 5000 });
        await gerenteOption.click();
        await page.waitForTimeout(500);

        // 6. Enter PIN - The input is a password field
        const pinInput = page.locator('input[type="password"]').first();
        await expect(pinInput).toBeVisible({ timeout: 5000 });
        await pinInput.fill('1');

        // 7. Submit - click "Entrar"
        const entrarBtn = page.locator('button:has-text("Entrar")');
        await expect(entrarBtn).toBeVisible({ timeout: 3000 });
        await entrarBtn.click();

        // 8. Verify Redirection to Dashboard
        await page.waitForTimeout(3000);

        // Should be on dashboard or main app
        const currentUrl = page.url();
        expect(currentUrl).toMatch(/dashboard|pos|caja/i);
    });
});
