import { describe, expect, it } from 'vitest';
import { isValidPersistedStateJSON } from '@/presentation/store/indexedDBStorage';

describe('indexedDBStorage', () => {
    it('valida strings JSON correctos', () => {
        expect(isValidPersistedStateJSON('{"state":{"ok":true},"version":1}')).toBe(true);
        expect(isValidPersistedStateJSON('[1,2,3]')).toBe(true);
    });

    it('rechaza JSON corrupto o vacío para evitar crasheo en hydrate', () => {
        expect(isValidPersistedStateJSON('')).toBe(false);
        expect(isValidPersistedStateJSON('{"state":')).toBe(false);
        expect(isValidPersistedStateJSON(undefined)).toBe(false);
        expect(isValidPersistedStateJSON(null)).toBe(false);
    });
});
