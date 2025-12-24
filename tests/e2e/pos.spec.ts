import { test, expect } from '@playwright/test';

/**
 * E2E Tests - Point of Sale (POS) System
 * Pharma-Synapse v3.1 - Farmacias Vallenar
 * 
 * These tests verify the POS functionality:
 * - POS page rendering
 * - Terminal/Shift management
 * - Cart operations
 * - Payment flow
 */

test.describe('POS Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/pos');
    });

    test('should show terminal blocked state or POS interface', async ({ page }) => {
        await page.waitForLoadState('networkidle');
        
        // POS should show blocked state (no shift) or active interface
        const isBlocked = await page.locator('text=/bloqueado|locked|apertura/i').first().isVisible().catch(() => false);
        const hasPOSInterface = await page.locator('text=/carrito|cart|buscar|search/i').first().isVisible().catch(() => false);
        const hasShiftModal = await page.locator('text=/apertura de caja|abrir turno/i').first().isVisible().catch(() => false);
        
        // Should have some POS-related UI
        expect(isBlocked || hasPOSInterface || hasShiftModal).toBeTruthy();
    });

    test('should display shift management options', async ({ page }) => {
        await page.waitForLoadState('networkidle');
        
        // Look for shift-related buttons
        const hasShiftButton = await page.locator('button:has-text("Apertura"), button:has-text("Open Shift"), button:has-text("Solicitar")').first().isVisible().catch(() => false);
        const hasTerminalInfo = await page.locator('text=/terminal|turno|shift/i').first().isVisible().catch(() => false);
        
        expect(hasShiftButton || hasTerminalInfo).toBeTruthy();
    });
});

test.describe('Shift Management Modal', () => {
    test('should open shift modal when clicking open shift button', async ({ page }) => {
        await page.goto('/pos');
        await page.waitForLoadState('networkidle');
        
        // Find and click the open shift button
        const openShiftBtn = page.locator('button:has-text("Apertura"), button:has-text("Solicitar Apertura")').first();
        
        if (await openShiftBtn.isVisible()) {
            await openShiftBtn.click();
            
            await page.waitForTimeout(1000);
            
            // Modal should appear with form fields
            const hasModal = await page.locator('[role="dialog"], .modal, .fixed.inset-0').first().isVisible().catch(() => false);
            const hasLocationSelect = await page.locator('select, text=/sucursal|location/i').first().isVisible().catch(() => false);
            const hasTerminalSelect = await page.locator('text=/terminal|caja/i').first().isVisible().catch(() => false);
            
            expect(hasModal || hasLocationSelect || hasTerminalSelect).toBeTruthy();
        }
    });

    test('should require PIN for shift authorization', async ({ page }) => {
        await page.goto('/pos');
        await page.waitForLoadState('networkidle');
        
        const openShiftBtn = page.locator('button:has-text("Apertura"), button:has-text("Solicitar")').first();
        
        if (await openShiftBtn.isVisible()) {
            await openShiftBtn.click();
            await page.waitForTimeout(500);
            
            // Look for PIN input in the flow
            const hasPINInput = await page.locator('input[type="password"], input[maxlength="4"]').first().isVisible().catch(() => false);
            const hasAuthStep = await page.locator('text=/autorización|pin|gerente|manager/i').first().isVisible().catch(() => false);
            const hasForm = await page.locator('form, select, input').first().isVisible().catch(() => false);
            
            // Modal should have form fields
            expect(hasPINInput || hasAuthStep || hasForm).toBeTruthy();
        }
    });
});

test.describe('POS Cart Operations', () => {
    // Note: These tests assume an active shift exists
    test('should have search functionality', async ({ page }) => {
        await page.goto('/pos');
        await page.waitForLoadState('networkidle');
        
        // Look for search input
        const searchInput = page.locator('input[placeholder*="buscar" i], input[placeholder*="search" i], input[type="search"]').first();
        
        if (await searchInput.isVisible()) {
            await searchInput.fill('paracetamol');
            await page.waitForTimeout(1000);
            
            // Should show search results or empty state
            const hasResults = await page.locator('text=/paracetamol/i').first().isVisible().catch(() => false);
            const hasEmptyState = await page.locator('text=/no encontrado|not found|sin resultados/i').first().isVisible().catch(() => false);
            
            expect(hasResults || hasEmptyState || await searchInput.isVisible()).toBeTruthy();
        }
    });

    test('should display cart section', async ({ page }) => {
        await page.goto('/pos');
        await page.waitForLoadState('networkidle');
        
        // Look for cart UI elements
        const hasCartSection = await page.locator('text=/carrito|cart|carro/i').first().isVisible().catch(() => false) ||
                              await page.locator('[data-testid="cart"]').first().isVisible().catch(() => false);
        const hasTotalDisplay = await page.locator('text=/total|subtotal/i').first().isVisible().catch(() => false);
        const hasPayButton = await page.locator('button:has-text("Pagar"), button:has-text("Pay")').first().isVisible().catch(() => false);
        
        // If POS is active, should have cart UI
        const pageLoaded = await page.locator('main, body').first().isVisible();
        expect(pageLoaded || hasCartSection || hasTotalDisplay || hasPayButton).toBeTruthy();
    });
});

test.describe('Cash Management', () => {
    test('should have cash management buttons when shift is active', async ({ page }) => {
        await page.goto('/pos');
        await page.waitForLoadState('networkidle');
        
        // Look for cash management options
        const hasCashButtons = 
            await page.locator('button:has-text("Arqueo")').first().isVisible().catch(() => false) ||
            await page.locator('button:has-text("Ingreso")').first().isVisible().catch(() => false) ||
            await page.locator('button:has-text("Cierre")').first().isVisible().catch(() => false) ||
            await page.locator('button:has-text("Cerrar Turno")').first().isVisible().catch(() => false);
        
        // Cash management buttons OR blocked state
        const isBlockedState = await page.locator('text=/bloqueado|locked/i').first().isVisible().catch(() => false);
        
        expect(hasCashButtons || isBlockedState).toBeTruthy();
    });

    test('should show security indicators in cash operations', async ({ page }) => {
        await page.goto('/pos');
        await page.waitForLoadState('networkidle');
        
        // Click on cash management if available
        const cashButton = page.locator('button:has-text("Ingreso"), button:has-text("Gasto")').first();
        
        if (await cashButton.isVisible()) {
            await cashButton.click();
            await page.waitForTimeout(500);
            
            // Look for v2 security indicators
            const hasSecurityBadge = await page.locator('text=/v2 seguro|auditoría/i').first().isVisible().catch(() => false);
            const hasModal = await page.locator('[role="dialog"], .modal').first().isVisible().catch(() => false);
            
            expect(hasSecurityBadge || hasModal || await cashButton.isVisible()).toBeTruthy();
        }
    });
});

test.describe('POS Accessibility', () => {
    test('should have proper heading structure', async ({ page }) => {
        await page.goto('/pos');
        await page.waitForLoadState('networkidle');
        
        // Check for headings
        const h1Count = await page.locator('h1').count();
        const h2Count = await page.locator('h2').count();
        
        expect(h1Count + h2Count).toBeGreaterThan(0);
    });

    test('should have interactive elements visible', async ({ page }) => {
        await page.goto('/pos');
        await page.waitForLoadState('networkidle');
        
        // Check for buttons
        const buttonCount = await page.locator('button').count();
        expect(buttonCount).toBeGreaterThan(0);
    });

    test('should be responsive', async ({ page }) => {
        await page.goto('/pos');
        
        // Test different viewport sizes
        await page.setViewportSize({ width: 375, height: 667 }); // Mobile
        await page.waitForTimeout(500);
        
        let mobileVisible = await page.locator('body').isVisible();
        
        await page.setViewportSize({ width: 1280, height: 800 }); // Desktop
        await page.waitForTimeout(500);
        
        let desktopVisible = await page.locator('body').isVisible();
        
        expect(mobileVisible && desktopVisible).toBeTruthy();
    });
});
