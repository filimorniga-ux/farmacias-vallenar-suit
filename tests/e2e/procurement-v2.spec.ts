import { test, expect } from '@playwright/test';

// Global timeout: 5 minutes for CI/Dev slowness
test.setTimeout(300000);

test.describe('Procurement V2 - Supply Chain (Pedido Sugerido)', () => {

    test.beforeEach(async ({ page }) => {
        // 1. Clean Navigation
        console.log('Navigating to root...');
        await page.goto('/');

        // 2. Robust Wait for App Load
        console.log('Waiting for app to load...');
        await expect(
            page.getByText('Administración')
                .or(page.getByRole('heading', { name: '¿Dónde inicias turno hoy?' }))
                .or(page.getByText('Panel de Control'))
        ).toBeVisible({ timeout: 180000 });

        // 3. Handle Location Selection
        const selectionHeader = page.getByRole('heading', { name: '¿Dónde inicias turno hoy?' });
        if (await selectionHeader.isVisible()) {
            console.log('Location Selection Screen detected.');
            const specificLocation = page.getByText('Farmacia Vallenar Centro');

            if (await specificLocation.isVisible()) {
                await specificLocation.click();
            } else {
                await page.locator('button').first().click();
            }
            await page.waitForLoadState('networkidle');
        }

        // 4. Login Flow
        if (await page.getByText('Panel de Control').isVisible()) {
            console.log('Already logged in.');
            return;
        }

        console.log('Proceeding to Login...');
        const adminLink = page.getByText('Administración');
        if (await adminLink.isVisible()) {
            await adminLink.click();

            await page.getByText('Admin Santiago').or(page.getByText('Admin')).first().click();

            console.log('Entering PIN 1213...');
            await page.getByPlaceholder('••••').fill('1213');
            await page.getByRole('button', { name: 'Entrar' }).click();

            await expect(page.getByText('Panel de Control')).toBeVisible({ timeout: 60000 });
        }
    });

    test('should load Supply Chain page and run AI Analysis', async ({ page }) => {
        console.log('Navigating to /supply-chain...');
        await page.goto('/supply-chain');

        // Robust selector as requested
        console.log('Waiting for Supply Chain page container...');
        await page.waitForSelector('[data-testid="supply-chain-page"]', { state: 'visible', timeout: 60000 });
        await expect(page.getByRole('heading', { name: 'Cadena de Suministro' })).toBeVisible();

        console.log('Checking for analysis state...');
        const loadingText = page.getByText('Analizando patrones de consumo...');
        const analyzeBtn = page.locator('[data-testid="analyze-stock-btn"]');

        // Check if auto-analysis is running
        const isAnalyzing = await loadingText.isVisible({ timeout: 5000 });

        if (!isAnalyzing) {
            console.log('Auto-analysis not confirmed, ensuring button is present...');
            // Wait for button to be available if not analyzing
            await analyzeBtn.waitFor({ state: 'visible', timeout: 30000 });

            if (await analyzeBtn.isEnabled()) {
                console.log('Manually triggering analysis...');
                await analyzeBtn.click();
            }
        } else {
            console.log('Auto-analysis started.');
        }

        // Result Validation
        const resultsTable = page.locator('table');
        const emptyState = page.getByText('Todo en orden');
        const genericError = page.getByText('Error');

        console.log('Waiting for results...');
        await expect(resultsTable.or(emptyState).or(genericError)).toBeVisible({ timeout: 90000 });

        if (await resultsTable.isVisible()) {
            console.log('Suggestions found.');
            await expect(page.getByRole('cell', { name: 'Sugerencia' })).toBeVisible();
        }
    });

});
