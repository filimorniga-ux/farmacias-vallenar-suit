import { describe, expect, it } from 'vitest';

import { readPreferredPublicContext } from '@/presentation/lib/preferredPublicContext';

function makeStorage(values: Record<string, string>) {
    return {
        getItem: (key: string) => values[key] ?? null,
    };
}

describe('readPreferredPublicContext', () => {
    it('retorna null si no existe preferred_location_id', () => {
        expect(readPreferredPublicContext(makeStorage({}))).toBeNull();
    });

    it('normaliza el tipo y usa nombre por defecto', () => {
        expect(readPreferredPublicContext(makeStorage({
            preferred_location_id: 'loc-1',
            preferred_location_type: 'INVALID',
        }))).toEqual({
            id: 'loc-1',
            name: 'Sucursal Identificada',
            type: 'STORE',
        });
    });

    it('retorna el contexto persistido cuando existe', () => {
        expect(readPreferredPublicContext(makeStorage({
            preferred_location_id: 'loc-2',
            preferred_location_name: 'Sucursal Norte',
            preferred_location_type: 'WAREHOUSE',
        }))).toEqual({
            id: 'loc-2',
            name: 'Sucursal Norte',
            type: 'WAREHOUSE',
        });
    });
});
