import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('global mobile touch target CSS', () => {
    it('enforces a coarse-pointer touch target baseline without changing desktop controls', () => {
        const cssPath = path.join(process.cwd(), 'src/app/globals.css');
        const css = readFileSync(cssPath, 'utf8');

        expect(css).toContain('@media (pointer: coarse)');
        expect(css).toContain('-webkit-tap-highlight-color');
        expect(css).toContain('min-height: 44px');
        expect(css).toContain('min-width: 44px');
        expect(css).toContain('[role="combobox"]');
        expect(css).toContain('[role="option"]');
        expect(css).toContain('[role="tab"]');
        expect(css).toContain('[role="menuitem"]');
    });

    it('keeps WMS sticky actions clear of the mobile bottom navigation', () => {
        const cssPath = path.join(process.cwd(), 'src/app/globals.css');
        const css = readFileSync(cssPath, 'utf8');

        expect(css).toContain('--wms-bottom-navigation-clearance');
        expect(css).toContain('@media (max-width: 1023px)');
        expect(css).toContain('.wms-sticky-action');
        expect(css).toContain('bottom: var(--wms-bottom-navigation-clearance)');
    });
});
