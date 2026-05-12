import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL_SOURCE_FILES = [
    'src/actions/supply-v2.ts',
    'src/actions/wms-v2.ts',
    'src/actions/procurement-v2.ts',
    'src/actions/labels-v2.ts',
] as const;

describe('product id SQL contract', () => {
    it('castea products.id antes de aplicar regex porque la columna runtime es uuid', () => {
        const combinedSqlSources = SQL_SOURCE_FILES
            .map((file) => readFileSync(join(process.cwd(), file), 'utf8'))
            .join('\n');

        expect(combinedSqlSources).not.toMatch(/\bp\.id\s+~\*?\s/);
        expect(combinedSqlSources).toContain('p.id::text ~* $2');
        expect(combinedSqlSources).toContain("p.id::text ~ '^[0-9a-f]{8}-'");
    });

    it('lee metadatos opcionales de etiquetas sin exigir columnas físicas en products', () => {
        const labelsSource = readFileSync(join(process.cwd(), 'src/actions/labels-v2.ts'), 'utf8');

        expect(labelsSource).toContain("to_jsonb(p)->>'barcode'");
        expect(labelsSource).toContain("to_jsonb(p)->>'laboratory'");
        expect(labelsSource).toContain("to_jsonb(p)->>'price_per_unit'");
        expect(labelsSource).not.toContain('p.barcode');
        expect(labelsSource).not.toContain('p.laboratory');
        expect(labelsSource).not.toContain('p.price_per_unit');
    });

    it('no exige columnas opcionales de products en resolvers WMS/Procurement', () => {
        const combinedSqlSources = [
            'src/actions/supply-v2.ts',
            'src/actions/wms-v2.ts',
            'src/actions/procurement-v2.ts',
        ]
            .map((file) => readFileSync(join(process.cwd(), file), 'utf8'))
            .join('\n');

        expect(combinedSqlSources).toContain("to_jsonb(p)->>'barcode'");
        expect(combinedSqlSources).toContain("to_jsonb(p)->>'cost_net'");
        expect(combinedSqlSources).toContain("to_jsonb(p)->>'stock_minimo_seguridad'");
        expect(combinedSqlSources).not.toMatch(/\bp\.(barcode|cost_net|stock_minimo_seguridad)\b/);
    });

    it('no exige columnas opcionales de products en lecturas publicas y analytics', () => {
        const combinedSqlSources = [
            'src/actions/analytics/price-arbitrage.ts',
            'src/actions/public/get-alternatives.ts',
            'src/actions/public-catalog-v2.ts',
            'src/actions/price-research.ts',
            'src/actions/pricing-intelligence.ts',
        ]
            .map((file) => readFileSync(join(process.cwd(), file), 'utf8'))
            .join('\n');

        expect(combinedSqlSources).toContain("to_jsonb(p)->>'barcode'");
        expect(combinedSqlSources).toContain("to_jsonb(p)->>'laboratory'");
        expect(combinedSqlSources).toContain("to_jsonb(p)->>'isp_register'");
        expect(combinedSqlSources).toContain("to_jsonb(p)->>'is_bioequivalent'");
        expect(combinedSqlSources).toContain("to_jsonb(p)->>'is_visible'");
        expect(combinedSqlSources).toContain("to_jsonb(p)->>'category_id'");
        expect(combinedSqlSources).toContain("to_jsonb(p)->>'cost_net'");
        expect(combinedSqlSources).not.toMatch(
            /\bp\.(barcode|laboratory|isp_register|is_bioequivalent|is_visible|category_id|cost_net)\b/,
        );
    });
});
