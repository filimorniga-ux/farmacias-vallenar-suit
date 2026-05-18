import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('finance monthly closing mobile tabs', () => {
    it('mantiene tabs horizontales sin encoger en móvil', () => {
        const page = readFileSync(
            path.join(process.cwd(), 'src/app/finance/monthly-closing/page.tsx'),
            'utf8',
        );

        expect(page).toContain('overflow-x-auto pb-2 scrollbar-hide');
        expect(page).toContain('shrink-0 px-3 py-2 rounded-lg border');
    });
});
