import { afterEach, describe, expect, it } from 'vitest';
import { matchProduct, type MatchInput } from '@/services/inventory-matcher';

interface QueryResultRow {
    id?: string;
    name?: string;
    barcode?: string;
    registration_number?: string;
    product_name?: string;
    holder_name?: string;
}

interface QueryClientLike {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: QueryResultRow[] }>;
}

const ORIGINAL_OPENAI_API_KEY = process.env.OPENAI_API_KEY;

describe('inventory-matcher', () => {
    afterEach(() => {
        if (ORIGINAL_OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_API_KEY;
    });

    it('degrada explícitamente cuando falta OPENAI_API_KEY', async () => {
        delete process.env.OPENAI_API_KEY;

        const client: QueryClientLike = {
            query: async (sql: string) => {
                if (sql.includes('FROM isp_registry') && sql.includes('LIMIT 5')) {
                    return {
                        rows: [{ registration_number: 'ISP-1', product_name: 'Producto Oficial', holder_name: 'Lab' }],
                    };
                }

                return { rows: [] };
            },
        };

        const input: MatchInput = { title: 'Paracetamol 500mg' };
        const result = await matchProduct(client, input);

        expect(result.matchType).toBe('AI_SKIPPED');
        expect(result.suggestion).toMatchObject({
            source: 'AI_UNAVAILABLE',
            reason: 'OPENAI_API_KEY not configured',
        });
    });
});
