import { test, expect } from '@playwright/test';

test.describe('Monthly Closing Module', () => {
    test.beforeEach(async ({ context, page }) => {
        // Increase timeout for initial page load
        test.setTimeout(120000);

        // Listen for console logs and errors
        page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
        page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

        // Bypass Login: Inject Cookies and LocalStorage
        const userId = '5e6f01ba-50b8-41f6-89ba-fb9ae5089af7'; // Admin Colchagua
        const locationId = 'bd7ddf7a-fac6-42f5-897d-bae8dfb3adf6'; // Vallenar Santiago

        // Set Cookies for Server Actions / Middleware
        await context.addCookies([
            { name: 'user_id', value: userId, domain: 'localhost', path: '/' },
            { name: 'user_role', value: 'ADMIN', domain: 'localhost', path: '/' },
            { name: 'user_location', value: locationId, domain: 'localhost', path: '/' },
            { name: 'preferred_location_id', value: locationId, domain: 'localhost', path: '/' },
            { name: 'user_name', value: 'Admin Colchagua', domain: 'localhost', path: '/' },
        ]);

        // Inject LocalStorage for Zustand Store (Client-Side)
        await page.addInitScript(({ userId, locationId }) => {
            // Mock User Object
            const user = {
                id: userId,
                name: 'Admin Colchagua',
                role: 'ADMIN',
                assigned_location_id: null,
                access_pin: '1234', // Mock
                email: 'admin@vallenar.cl',
                job_title: 'Admin',
                is_active: true,
                allowed_modules: ['*']
            };

            window.localStorage.setItem('pharma-storage', JSON.stringify({
                state: {
                    user: user,
                    currentLocationId: locationId,
                    isInitialized: true,
                    // Minimal required state to prevent crashes
                    printerConfig: { auto_print_sale: true }
                },
                version: 0
            }));

            window.localStorage.setItem('context_location_id', locationId);
        }, { userId, locationId });

        console.log('Navigating to Dashboard (Bypassing Login)...');
        // Go to dashboard to hydrate
        await page.goto('/dashboard', { waitUntil: 'commit', timeout: 60000 });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(3000); // Wait for hydration
    });

    test('should manage monthly closing entries and execute closing', async ({ page }) => {
        // 2. Navigate to Monthly Closing
        // Assuming there is a sidebar or we can go directly
        await page.goto('/finance/monthly-closing');
        await expect(page.locator('h1')).toContainText('Cierre Mensual Financiero');

        // 3. Ensure we are in Draft Mode (or Reopen if closed)
        const closedBadge = page.locator('text=CERRADO - No editable');
        if (await closedBadge.isVisible()) {
            // Reopen Logic
            await page.locator('button:has-text("Reabrir Período")').click();
            await page.locator('textarea[placeholder*="Explique"]').fill('Test automation reopening period which requires twenty chars');
            await page.locator('button:has-text("Continuar")').click();
            // PIN for Reopen
            const pinInputs = page.locator('input.w-12'); // Looking for PIN input styled cells
            if (await pinInputs.count() > 0) {
                // Assuming unified pin input or individual cells. 
                // Based on PinModal in page.tsx, it likely uses a shared component.
                // Let's assume standard input for now or check previous tests.
                // PinModal.tsx usually has input type="password" or specialized input.
                // Let's try filling the hidden input if it's the standard digit component
                // Or type keys
                await page.keyboard.type('1');
                await page.waitForTimeout(500);
                // Usually PinModal auto-submits on complete or has Enter button
            } else {
                // Fallback to text input if simple
                await page.locator('input[type="password"]').last().fill('1');
                await page.locator('button:has-text("Confirmar")').click();
            }
            await page.waitForTimeout(2000);
        }

        await expect(page.locator('text=BORRADOR - Editable')).toBeVisible();

        // 4. Add Income Entry (CASH)
        // Select tab (Default is CASH)
        await page.locator('button:has-text("Efectivo Recaudado")').click();

        const incomeDate = page.locator('input[type="date"]').first();
        const incomeAmount = page.locator('input[placeholder="0"]').first();
        const incomeDesc = page.locator('input[placeholder*="referencia"]').first();
        const addIncomeBtn = page.locator('button:has-text("Agregar")').first();

        // Use today's date formatted YYYY-MM-DD
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];

        // NOTE: page.tsx defaults date to start of month. We should use a valid date for selected period.
        // Selected period defaults to current month/year.

        await incomeDate.fill(dateStr);
        await incomeAmount.fill('50000');
        await incomeDesc.fill('Test Automation Income');
        await addIncomeBtn.click();

        // Verify toast or list update
        await expect(page.locator('text=Test Automation Income')).toBeVisible();
        await expect(page.locator('text=50.000')).toBeVisible();

        // 5. Add Expense Entry (DAILY)
        // Select tab (Default is DAILY_EXPENSE in separate panel)
        // Need to target the second panel.
        // The page layout has Ingresos (left/top) and Egresos (right/bottom).
        // Expense tab buttons are in the Expense panel.

        await page.locator('button:has-text("Gastos Diarios")').click();

        // Inputs are repeated, need to be specific or use layout hierarchy
        const expensePanel = page.locator('.from-rose-50').locator('..'); // Find container with rose header
        const expenseDate = expensePanel.locator('input[type="date"]');
        const expenseAmount = expensePanel.locator('input[placeholder="0"]');
        const expenseDesc = expensePanel.locator('input[placeholder*="referencia"]');
        const addExpenseBtn = expensePanel.locator('button:has-text("Agregar")');

        await expenseDate.fill(dateStr);
        await expenseAmount.fill('12000');
        await expenseDesc.fill('Test Automation Expense');
        await addExpenseBtn.click();

        await expect(page.locator('text=Test Automation Expense')).toBeVisible();

        // 6. Verify Net Result
        // 50000 - 12000 = 38000
        await expect(page.locator('text=$38.000')).toBeVisible();

        // 7. Save Draft
        await page.locator('textarea[placeholder*="Observaciones"]').fill('Test Draft Note');
        await page.locator('button:has-text("Guardar Borrador")').click();
        await expect(page.locator('text=Borrador guardado')).toBeVisible();

        // 8. Close Month
        await page.locator('button:has-text("CERRAR MES")').click();

        // Pin Modal appears
        await expect(page.locator('text=Cerrar Mes Definitivamente')).toBeVisible();
        // Assuming PinModal logic
        // Try typing logic for PinModal 
        await page.keyboard.press('1'); // Digit 1
        await page.waitForTimeout(200);
        // If PinModal requires 4 digits, usually test PIN '1' might map to '1','Enter' or similar?
        // Let's Assume the PIN '1' is sufficient based on login flow, but usually PINs are 4 digits long in real apps.
        // However, auth-v2.ts validation likely checks bcrypt hash.
        // If user 'Gerente General' has PIN '1', let's assume typing '1' works if auto-submit isn't blocking length.

        // Wait for confirmation button if manual
        const confirmBtn = page.locator('button:has-text("Confirmar")');
        if (await confirmBtn.isVisible()) {
            await confirmBtn.click();
        }

        // Verify Status Change
        await expect(page.locator('text=MES FINALIZADO')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=CERRADO - No editable')).toBeVisible();

        // Verify Inputs Disabled
        await expect(incomeAmount).toBeDisabled();
    });
});
