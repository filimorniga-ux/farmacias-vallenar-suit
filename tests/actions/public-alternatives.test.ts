import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, mockLogger } = vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockLogger: {
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

let currentIp = '192.168.50.1';

vi.mock('@/lib/db', () => ({
    query: (...args: unknown[]) => mockQuery(...args),
}));

vi.mock('@/lib/logger', () => ({
    logger: mockLogger,
}));

vi.mock('next/headers', () => ({
    headers: vi.fn(async () => ({
        get: (name: string) => {
            if (name.toLowerCase() === 'x-forwarded-for') return currentIp;
            return null;
        },
    })),
}));

import { getAlternativesAction } from '@/actions/public/get-alternatives';

describe('public alternatives action', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        currentIp = `192.168.50.${Math.floor(Math.random() * 200) + 1}`;
        mockQuery.mockResolvedValue({ rows: [] });
    });

    it('rechaza entradas sin currentId antes de consultar DB', async () => {
        const result = await getAlternativesAction('paracetamol', '');

        expect(result).toEqual([]);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('normaliza el término y limita la cantidad de palabras usadas en SQL dinámico', async () => {
        await getAlternativesAction(
            'paracetamol ibuprofeno diclofenaco naproxeno aspirina loratadina cetirizina <script>',
            'product-1',
        );

        expect(mockQuery).toHaveBeenCalledTimes(1);
        const [sql, params] = mockQuery.mock.calls[0];

        expect(String(sql)).not.toContain('script');
        expect(params).toEqual([
            'product-1',
            '%paracetamol%',
            '%ibuprofeno%',
            '%diclofenaco%',
            '%naproxeno%',
            '%aspirina%',
            '%loratadina%',
        ]);
    });

    it('mantiene precio y stock exactos fuera del contrato público', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: 'alt-1',
                name: 'Paracetamol 500 MG',
                sku: 'SKU-1',
                dci: 'Paracetamol',
                laboratory: 'Lab',
                format: 'Comprimidos',
                isp_register: 'ISP-1',
                units_per_box: 20,
                is_bioequivalent: true,
                stock: 25,
                price: 1990,
            }],
        });

        const result = await getAlternativesAction('paracetamol', 'product-1');

        expect(result[0]).toMatchObject({
            id: 'alt-1',
            availabilityStatus: 'Disponible',
            priceLabel: 'Consultar en local',
            stock: null,
            price: null,
        });
    });

    it('aplica rate limit antes de consultar DB', async () => {
        currentIp = '192.168.50.250';

        for (let i = 0; i < 20; i++) {
            await getAlternativesAction('paracetamol', `product-${i}`);
        }

        const limited = await getAlternativesAction('paracetamol', 'product-limited');

        expect(limited).toEqual([]);
        expect(mockQuery).toHaveBeenCalledTimes(20);
        expect(mockLogger.warn).toHaveBeenCalledWith(
            { ip: '192.168.50.250' },
            '[Alternatives] Rate limit exceeded',
        );
    });
});
