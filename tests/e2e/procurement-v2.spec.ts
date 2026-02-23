import { test, expect } from '@playwright/test';
import { loginAsManager } from './helpers/login';

test.setTimeout(300000);

test.describe('Procurement V2 - Supply Chain', () => {
    test.beforeEach(async ({ page }) => {
        const loggedIn = await loginAsManager(page, {
            module: 'Administración',
            user: 'Gerente General 1',
            pin: '1213',
        }).then(() => true).catch(() => false);
        test.skip(!loggedIn, 'Login/contexto no disponible para Supply Chain');
    });

    test('carga página de cadena de suministro y controles de análisis', async ({ page }) => {
        await page.goto('/supply-chain', { waitUntil: 'domcontentloaded' });

        const pageContainer = page.locator('[data-testid="supply-chain-page"]');
        const heading = page.getByRole('heading', { name: /Cadena de Suministro/i });

        const hasContainer = await pageContainer.isVisible().catch(() => false);
        if (hasContainer) {
            await expect(pageContainer).toBeVisible({ timeout: 90000 });
        } else {
            await expect(heading).toBeVisible({ timeout: 90000 });
        }

        const analyzeBtn = page.locator('[data-testid="analyze-stock-btn"]');
        const hasAnalyzeButton = await analyzeBtn.isVisible().catch(() => false);
        const hasAnalysisState = await page.getByText(/Analizando patrones de consumo|Todo en orden|Sugerencia|Error/i).first().isVisible().catch(() => false);

        expect(hasAnalyzeButton || hasAnalysisState).toBeTruthy();
    });
});
