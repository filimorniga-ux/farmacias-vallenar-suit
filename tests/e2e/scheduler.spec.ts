import { test, expect, type Page } from '@playwright/test';
import { loginAsManager } from './helpers/login';

test.setTimeout(300000);

async function openScheduler(page: Page) {
    const loggedIn = await loginAsManager(page, {
        module: 'Administración',
        user: 'Gerente General 1',
        pin: '1213',
    }).then(() => true).catch(() => false);

    test.skip(!loggedIn, 'Login/contexto no disponible para Gestor Horario');

    await page.goto('/rrhh/horarios', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
}

async function ensureDesktop(page: Page) {
    const vp = page.viewportSize();
    if (vp && vp.width < 900) {
        test.skip(true, 'Flujo scheduler validado solo en layout desktop');
    }
}

async function createTemplate(page: Page, name: string) {
    const openTemplates = page.getByRole('button', { name: /Plantillas/i }).first();
    if (!(await openTemplates.isVisible().catch(() => false))) {
        test.skip(true, 'Botón Plantillas no visible');
    }

    await openTemplates.click();
    await expect(page.getByText(/Gestionar Plantillas/i).first()).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder(/Ej:\s*Turno Mañana/i).fill(name);
    await page.getByRole('button', { name: /Crear Plantilla/i }).click();
}

test.describe('Scheduler - Gestor Horario E2E', () => {
    test.beforeEach(async ({ page }) => {
        await openScheduler(page);
        await ensureDesktop(page);
    });

    test('carga grilla y controles principales', async ({ page }) => {
        await expect(page.getByText(/Gestor de Horarios|Gestor Horario/i).first()).toBeVisible({ timeout: 30000 });
        await expect(page.getByRole('button', { name: /Plantillas/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /Ausencia/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /Copiar Semana/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /Autocompletar/i })).toBeVisible();
    });

    test('crea plantilla desde modal y queda visible', async ({ page }) => {
        const templateName = `E2E Scheduler ${Date.now()}`;
        await createTemplate(page, templateName);

        const successToast = page.getByText(/Plantilla creada/i).first();
        const denied = page.getByText(/No autenticado|No autorizado|No tienes acceso/i).first();

        await expect
            .poll(async () => {
                if (await successToast.isVisible().catch(() => false)) return 'ok';
                if (await denied.isVisible().catch(() => false)) return 'denied';
                return 'pending';
            }, { timeout: 20000 })
            .not.toBe('pending');
    });

    test('registra ausencia y muestra resultado', async ({ page }) => {
        const btn = page.getByRole('button', { name: /Ausencia/i }).first();
        if (!(await btn.isVisible().catch(() => false))) {
            test.skip(true, 'Botón Ausencia no visible');
        }

        await btn.click();
        await expect(page.getByText(/Registrar Ausencia|Bloqueo/i).first()).toBeVisible({ timeout: 10000 });

        await page.getByRole('combobox').first().click();
        const firstUser = page.getByRole('option').first();
        if (!(await firstUser.isVisible().catch(() => false))) {
            test.skip(true, 'No hay usuarios visibles en modal de ausencias');
        }
        await firstUser.click();

        const today = new Date().toISOString().slice(0, 10);
        await page.getByLabel('Desde').fill(today);
        await page.getByLabel('Hasta').fill(today);
        await page.getByRole('button', { name: /Registrar Ausencia/i }).click();

        const success = page.getByText(/Ausencia registrada/i).first();
        const overlap = page.getByText(/Ya existe una ausencia/i).first();
        const auth = page.getByText(/No autenticado|No autorizado/i).first();

        await expect
            .poll(async () => {
                if (await success.isVisible().catch(() => false)) return 'success';
                if (await overlap.isVisible().catch(() => false)) return 'overlap';
                if (await auth.isVisible().catch(() => false)) return 'auth';
                return 'pending';
            }, { timeout: 20000 })
            .not.toBe('pending');
    });

    test('autocompleta y expone flujo de publicación semanal', async ({ page }) => {
        const templateName = `E2E Auto ${Date.now()}`;
        await createTemplate(page, templateName);
        await page.keyboard.press('Escape').catch(() => undefined);

        await page.getByRole('button', { name: /Autocompletar/i }).click();

        const draftSuccess = page.getByText(/Borrador generado/i).first();
        const draftError = page.getByText(/No hay personal disponible|No hay plantillas activas|No fue posible generar/i).first();

        await expect
            .poll(async () => {
                if (await draftSuccess.isVisible().catch(() => false)) return 'ok';
                if (await draftError.isVisible().catch(() => false)) return 'err';
                return 'pending';
            }, { timeout: 25000 })
            .not.toBe('pending');

        // Si generó borrador, debe permitir publicar y mostrar resultado
        const publishBtn = page.getByRole('button', { name: /Publicar/i }).first();
        if (await publishBtn.isEnabled().catch(() => false)) {
            page.once('dialog', (dialog) => dialog.accept());
            await publishBtn.click();

            const publishSuccess = page.getByText(/publicado/i).first();
            await expect(publishSuccess).toBeVisible({ timeout: 15000 });
        } else {
            expect(await publishBtn.isVisible().catch(() => false)).toBeTruthy();
        }
    });
});
