import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('QueueKioskPage public location persistence', () => {
    it('no mantiene una ubicación pública persistida si ya no aparece en la lista segura', () => {
        const source = readFileSync(
            join(process.cwd(), 'src/presentation/pages/QueueKioskPage.tsx'),
            'utf8',
        );

        expect(source).toContain('findAvailablePublicKioskLocation(res.data, storedLocation)');
        expect(source).toContain('clearStoredQueueLocation()');
        expect(source).toContain("localStorage.removeItem('preferred_location_type')");
        expect(source).toContain("localStorage.removeItem(QUEUE_KIOSK_TOKEN_KEY)");
    });

    it('persistencia de selección manual queda marcada como STORE para tótems públicos', () => {
        const source = readFileSync(
            join(process.cwd(), 'src/presentation/pages/QueueKioskPage.tsx'),
            'utf8',
        );

        expect(source).toContain("localStorage.setItem('preferred_location_type', 'STORE')");
        expect(source).toContain('onClick={() => handleSelectLocation(loc.id)}');
    });
});
