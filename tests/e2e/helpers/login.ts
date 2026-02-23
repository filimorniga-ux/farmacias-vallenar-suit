import { Page } from '@playwright/test';

export interface LoginOptions {
    branch?: string;
    module?: string;
    user?: string;
    pin?: string;
}

const DEFAULT_OPTIONS: Required<LoginOptions> = {
    branch: 'Farmacia Vallenar santiago',
    module: 'Administración',
    user: 'Gerente General 1',
    pin: '1213',
};

async function waitInitialSurface(page: Page): Promise<void> {
    await Promise.race([
        page.getByRole('button', { name: /Seleccionar/i }).first().waitFor({ state: 'visible', timeout: 90000 }),
        page.getByText('Administración', { exact: true }).first().waitFor({ state: 'visible', timeout: 90000 }),
        page.getByText('Punto de Venta', { exact: true }).first().waitFor({ state: 'visible', timeout: 90000 }),
        page.getByText('Logística', { exact: true }).first().waitFor({ state: 'visible', timeout: 90000 }),
        page.getByText('Resumen General', { exact: true }).first().waitFor({ state: 'visible', timeout: 90000 }),
        page.getByText(/No hay sucursales configuradas/i).first().waitFor({ state: 'visible', timeout: 90000 }),
    ]);
}

async function selectBranchIfPresent(page: Page, branch: string): Promise<void> {
    const selectButtons = page.getByRole('button', { name: /Seleccionar/i });
    if (!(await selectButtons.first().isVisible().catch(() => false))) {
        return;
    }

    const normalizedTarget = branch.toLowerCase();
    const buttonCount = await selectButtons.count();

    let selected = false;
    for (let i = 0; i < buttonCount; i += 1) {
        const button = selectButtons.nth(i);
        const cardText = (await button
            .locator('xpath=ancestor::*[self::article or self::section or self::div][1]')
            .innerText()
            .catch(() => '')).toLowerCase();

        if (cardText.includes(normalizedTarget)) {
            await button.click();
            selected = true;
            break;
        }
    }

    if (!selected) {
        // Fallback seguro: primer destino disponible
        await selectButtons.first().click();
    }

    await page.waitForLoadState('networkidle');
}

async function alreadyAuthenticated(page: Page): Promise<boolean> {
    const hasSidebar = await page.getByText('Resumen General', { exact: true }).isVisible().catch(() => false);
    const hasLogout = await page.getByRole('button', { name: /Cerrar Sesión|Salir/i }).first().isVisible().catch(() => false);
    return hasSidebar || hasLogout;
}

async function openModuleForLogin(page: Page, module: string): Promise<void> {
    const moduleHeading = page.getByRole('heading', { name: module }).first();
    if (await moduleHeading.isVisible().catch(() => false)) {
        await moduleHeading.click();
        return;
    }

    const moduleText = page.getByText(module, { exact: true }).first();
    if (await moduleText.isVisible().catch(() => false)) {
        await moduleText.click();
        return;
    }

    const accessFallback = page.getByText(/Acceder|Entrar/i).first();
    if (await accessFallback.isVisible().catch(() => false)) {
        await accessFallback.click();
        return;
    }

    throw new Error(`No se encontró forma de abrir módulo "${module}"`);
}

async function waitLoginModal(page: Page): Promise<void> {
    await Promise.race([
        page.getByRole('heading', { name: /Iniciar Sesión/i }).first().waitFor({ state: 'visible', timeout: 15000 }),
        page.getByRole('heading', { name: /Acceso Logística/i }).first().waitFor({ state: 'visible', timeout: 15000 }),
    ]);
}

async function chooseUser(page: Page, user: string): Promise<void> {
    const noUsersVisible = () => page.getByText(/No se encontraron usuarios/i).first().isVisible().catch(() => false);
    const retryButton = page.getByRole('button', { name: /Reintentar carga|Reintentando/i }).first();

    for (let attempt = 1; attempt <= 3; attempt += 1) {
        if (!(await noUsersVisible())) break;

        if (await retryButton.isVisible().catch(() => false)) {
            const isRetryDisabled = await retryButton.isDisabled().catch(() => true);
            if (!isRetryDisabled) {
                await retryButton.click();
            }
        }

        await page.waitForTimeout(1400 * attempt);
    }

    if (await noUsersVisible()) {
        throw new Error('LOGIN_NO_USERS_AVAILABLE');
    }

    const userButtons = page
        .locator('button')
        .filter({ hasText: /ADMIN|GERENTE|CAJERO|BODEGA|SUPERVISOR/i });
    await userButtons.first().waitFor({ state: 'visible', timeout: 15000 });

    const exactUser = page.getByRole('button', { name: new RegExp(user, 'i') }).first();
    if (await exactUser.isVisible().catch(() => false)) {
        await exactUser.click();
        return;
    }

    if (await userButtons.first().isVisible().catch(() => false)) {
        await userButtons.first().click();
        return;
    }

    throw new Error(`No se encontró usuario para login: ${user}`);
}

async function fillPinAndSubmit(page: Page, pin: string): Promise<void> {
    const pinInput = page
        .locator('input[type="password"], input[placeholder*="PIN" i], input[placeholder*="••••"]')
        .first();

    await pinInput.waitFor({ state: 'visible', timeout: 15000 });
    await pinInput.fill(pin);

    const submit = page.getByRole('button', { name: /Entrar|Ingresar|Acceder/i }).first();
    if (await submit.isVisible().catch(() => false)) {
        await submit.click();
    } else {
        // Algunos modales usan botón genérico ("..."), por eso usamos fallback de botón habilitado.
        const enabledFallback = page
            .locator('button:not([disabled])')
            .filter({ hasNotText: /Atrás|Volver|Cerrar/i })
            .last();
        if (await enabledFallback.isVisible().catch(() => false)) {
            await enabledFallback.click();
        } else {
            await page.keyboard.press('Enter');
        }
    }
}

async function submitLoginWithRetry(page: Page, pin: string, maxAttempts = 3): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        await fillPinAndSubmit(page, pin);

        const successPromise = Promise.race([
            page.waitForURL(/dashboard|pos|caja|warehouse|inventory|finance|supply-chain/i, { timeout: 12000 }),
            page.getByText('Resumen General', { exact: true }).waitFor({ state: 'visible', timeout: 12000 }),
        ]).then(() => 'success').catch(() => null);

        const errorLocator = page.locator('p.text-red-500, .text-red-500').first();
        const errorPromise = errorLocator.waitFor({ state: 'visible', timeout: 12000 })
            .then(async () => (await errorLocator.innerText().catch(() => '')).trim())
            .catch(() => '');

        const [successResult, errorText] = await Promise.all([successPromise, errorPromise]);
        if (successResult === 'success') return;

        const normalized = (errorText || '').toLowerCase();
        const transient = /timeout|temporalmente|no disponible|conexi[oó]n|servidor|reintento/.test(normalized);

        if (!transient) {
            throw new Error(errorText || 'LOGIN_FAILED_NO_RETRY');
        }

        if (attempt < maxAttempts) {
            await page.waitForTimeout(2000 * attempt);
            continue;
        }
    }

    throw new Error('LOGIN_TRANSIENT_FAILURE_RETRIES_EXHAUSTED');
}

export async function loginAsManager(page: Page, options?: LoginOptions): Promise<boolean> {
    const cfg = { ...DEFAULT_OPTIONS, ...(options ?? {}) };

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    try {
        await waitInitialSurface(page);
    } catch {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitInitialSurface(page);
    }

    if (await page.getByText(/No hay sucursales configuradas/i).first().isVisible().catch(() => false)) {
        throw new Error('LOGIN_NO_BRANCHES_CONFIGURED');
    }

    await selectBranchIfPresent(page, cfg.branch);

    if (await alreadyAuthenticated(page)) {
        return true;
    }

    await page.waitForLoadState('networkidle');
    await openModuleForLogin(page, cfg.module);
    await waitLoginModal(page);
    await chooseUser(page, cfg.user);
    await submitLoginWithRetry(page, cfg.pin);

    await page.waitForLoadState('networkidle').catch(() => undefined);
    return true;
}

export async function loginAsCashier(page: Page): Promise<boolean> {
    return loginAsManager(page, {
        module: 'Punto de Venta',
        user: 'Cajero Stgo AM 1',
        pin: '1234',
    });
}

export async function logout(page: Page): Promise<void> {
    const logoutButton = page.getByRole('button', { name: /Cerrar Sesión|Salir/i }).first();
    if (await logoutButton.isVisible().catch(() => false)) {
        await logoutButton.click();
        await page.waitForURL('**/');
    }
}

export async function goToInventory(page: Page): Promise<void> {
    await page.goto('/inventory', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
}

export async function goToCaja(page: Page): Promise<void> {
    await page.goto('/caja', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
}
