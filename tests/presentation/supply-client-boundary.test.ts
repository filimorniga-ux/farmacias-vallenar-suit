import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('supply client/server boundary', () => {
    it('no importa la libreria server-side de supply como runtime desde componentes cliente', () => {
        const receptionForm = readFileSync(
            join(process.cwd(), 'src/components/supply/ReceptionForm.tsx'),
            'utf8',
        );
        const restockingTable = readFileSync(
            join(process.cwd(), 'src/components/supply/RestockingTable.tsx'),
            'utf8',
        );

        expect(receptionForm).toContain("import type { Supplier } from '@/lib/data/supply'");
        expect(restockingTable).toContain("import type { RestockingItem } from '@/lib/data/supply'");
        expect(receptionForm).not.toMatch(/^import\s+\{[^}]*receiveProduct/m);
        expect(`${receptionForm}\n${restockingTable}`).not.toMatch(
            /^import\s+\{[^}]*\}\s+from ['"]@\/lib\/data\/supply['"]/m,
        );
    });
});
