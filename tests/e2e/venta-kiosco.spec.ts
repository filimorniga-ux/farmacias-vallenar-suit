import { test, expect } from '@playwright/test';

test.describe('Venta E2E - Flujo Kiosco', () => {

    test('Flujo completo de venta y validación de seguridad', async ({ page }) => {
        // Instrumentación
        page.on('console', msg => console.log(`BROWSER [${msg.type()}]: ${msg.text()}`));
        page.on('pageerror', err => console.log(`BROWSER ERROR: ${err.message}`));

        test.slow();
        console.log('🚀 Iniciando test E2E (Manual Auth Mode)...');

        // 1. Home y Selección de Sucursal
        await page.goto('/', { waitUntil: 'networkidle', timeout: 90000 });
        console.log('📍 Home navegada...');

        const branchBtn = page.locator('text="Farmacia Vallenar santiago"').first();
        await expect(branchBtn).toBeVisible({ timeout: 60000 });
        await branchBtn.click();
        console.log('📍 Sucursal seleccionada.');

        // 2. Selección de Módulo (Punto de Venta)
        console.log('🛒 Esperando módulo Punto de Venta...');
        const accederBtn = page.locator('div:has-text("Punto de Venta")').locator('button:has-text("ACCEDER")').first();
        await expect(accederBtn).toBeVisible({ timeout: 30000 });
        await accederBtn.click();
        console.log('🛒 Módulo VENDER clickeado.');

        // 3. Selección de Usuario y PIN
        console.log('🔑 Esperando lista de usuarios...');
        const userBtn = page.locator('text="Gerente General 1"').first();
        await expect(userBtn).toBeVisible({ timeout: 30000 });
        await userBtn.click();

        console.log('🔑 Ingresando PIN...');
        await page.fill('input[type="password"]', '1213');
        await page.click('button:has-text("Entrar")');

        // 4. Verificación de Dashboard/Ventas
        console.log('📊 Esperando carga del sistema...');
        await page.waitForURL(/.*dashboard|.*sales|.*pos.*/, { timeout: 30000 });

        if (page.url().includes('/dashboard')) {
            console.log('📊 En dashboard, navegando a ventas...');
            await page.goto('/sales', { waitUntil: 'networkidle' });
        }

        // 5. Manejo de Apertura de Caja
        console.log('💰 Verificando estado de caja...');
        await page.waitForTimeout(5000); // Esperar hidratación de estado de caja
        const abrirCajaBtn = page.locator('button:has-text("Abrir Caja")');
        if (await abrirCajaBtn.isVisible()) {
            console.log('📦 Apertura de caja requerida...');
            await abrirCajaBtn.click();
            await page.fill('input[placeholder*="Monto"], input[type="number"]', '20000');
            await page.click('button:has-text("Confirmar"), button:has-text("Abrir")');
            await page.waitForTimeout(2000);
        }

        // 6. Búsqueda y Venta de Producto
        console.log('🔍 Buscando Paracetamol...');
        const searchInput = page.locator('input[placeholder*="Buscar"], input[name="search"]').first();
        await expect(searchInput).toBeVisible({ timeout: 20000 });
        await searchInput.fill('Paracetamol');
        await searchInput.press('Enter');
        await page.waitForTimeout(3000);

        console.log('🛒 Añadiendo al carrito...');
        const productCard = page.locator('text="Paracetamol"').first();
        await expect(productCard).toBeVisible({ timeout: 15000 });
        await productCard.click();
        await page.waitForTimeout(1000);
        await productCard.click(); // 2 unidades

        // 7. Pago
        console.log('💳 Iniciando pago...');
        const pagarBtn = page.locator('button:has-text("Pagar"), .btn-primary:has-text("Pagar")').first();
        await pagarBtn.click();

        console.log('💵 Pago en Efectivo...');
        await page.click('text=Efectivo');
        await page.fill('input[placeholder*="Recibido"]', '100000');
        await page.click('button:has-text("Confirmar Pago"), button:has-text("Finalizar Venta")');

        // 8. Éxito y Seguridad
        console.log('✅ Verificando éxito...');
        await expect(page.locator('text=/Venta Finalizada|Venta Exitosa|Ticket/i')).toBeVisible({ timeout: 20000 });

        console.log('🛡️ Verificando seguridad de anulación...');
        const anularBtn = page.locator('button:has-text("Anular"), button:has-text("Devolver"), button:has-text("Eliminar")').first();
        if (await anularBtn.isVisible()) {
            await anularBtn.click();
            await expect(page.locator('text=/Autorización|PIN|Supervisor/i')).toBeVisible();
            console.log('✨ TEST COMPLETADO CON ÉXITO ✨');
        }
    });
});
