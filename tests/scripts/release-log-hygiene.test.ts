import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('release log hygiene', () => {
    it('evita fuentes remotas que vuelven el build dependiente de red', () => {
        const rootLayout = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8');
        const globalCss = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

        expect(rootLayout).not.toContain('next/font/google');
        expect(rootLayout).not.toContain('Inter(');
        expect(globalCss).toContain('font-family: Inter, ui-sans-serif, system-ui');
    });

    it('usa solo la ruta no deprecada para Sentry react component annotation', () => {
        const nextConfig = readFileSync(join(process.cwd(), 'next.config.mjs'), 'utf8');

        expect(nextConfig).not.toContain('\n    reactComponentAnnotation:');
        expect(nextConfig).toContain('webpack: {');
        expect(nextConfig).toContain('reactComponentAnnotation: { enabled: true }');
    });

    it('evita configurar NO_COLOR y FORCE_COLOR simultaneamente en el web server E2E', () => {
        const playwrightConfig = readFileSync(join(process.cwd(), 'playwright.config.ts'), 'utf8');
        const webServerStart = playwrightConfig.indexOf('webServer: {');
        expect(webServerStart).toBeGreaterThanOrEqual(0);

        expect(playwrightConfig).toContain('delete webServerEnv.NO_COLOR');
        expect(playwrightConfig).toContain('delete webServerEnv.FORCE_COLOR');
        expect(playwrightConfig).not.toContain('NO_COLOR:');
        expect(playwrightConfig).not.toContain('FORCE_COLOR:');

        const webServerConfig = playwrightConfig.slice(webServerStart);
        expect(webServerConfig).toContain('env: webServerEnv');
    });
});
