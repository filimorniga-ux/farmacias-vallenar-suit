import { test, expect } from '@playwright/test';

test.describe('POS Smoke Test', () => {
    test('debe cargar la página de inicio correctamente', async ({ page }) => {
        // 1. Navegar a home
        await page.goto('/');

        // 2. Verificar título básico o presencia de elemento root
        // ClientApp usually renders some layout. We check for page title.
        await expect(page).toHaveTitle(/Vallenar/i); // Adjust regex based on actual title

        // 3. Verificar que no haya errores de servidor visibles
        const errorHeading = page.locator('h1', { hasText: 'Error de Servidor' });
        await expect(errorHeading).not.toBeVisible();
    });
});
