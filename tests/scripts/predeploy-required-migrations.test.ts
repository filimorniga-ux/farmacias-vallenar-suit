import { describe, expect, it } from 'vitest';
import { PREDEPLOY_REQUIRED_MIGRATIONS } from '../../src/scripts/predeploy-required-migrations';

describe('predeploy required migrations', () => {
    it('keeps baseline and recent registered hotfix migrations in deploy-gate order', () => {
        const versions = PREDEPLOY_REQUIRED_MIGRATIONS.map(([version]) => version);

        expect(versions).toEqual([
            '001',
            '002',
            '003',
            '004',
            '005',
            '006',
            '007',
            '019',
            '022',
            '037',
            '038',
            '039',
            '040',
            '041',
            '042',
            '043',
        ]);
    });

    it('requires migrations that the current hotfix runner records in schema_migrations', () => {
        expect(PREDEPLOY_REQUIRED_MIGRATIONS).toContainEqual([
            '019',
            'Supabase RLS baseline policies',
        ]);
        expect(PREDEPLOY_REQUIRED_MIGRATIONS).toContainEqual([
            '022',
            'Secure maintenance backup tables',
        ]);
        expect(PREDEPLOY_REQUIRED_MIGRATIONS).toContainEqual([
            '037',
            'Server-side auth session columns',
        ]);
        expect(PREDEPLOY_REQUIRED_MIGRATIONS).toContainEqual([
            '038',
            'Notification reads scope fix',
        ]);
        expect(PREDEPLOY_REQUIRED_MIGRATIONS).toContainEqual([
            '039',
            'Smart-invoice delete audit action',
        ]);
        expect(PREDEPLOY_REQUIRED_MIGRATIONS).toContainEqual([
            '040',
            'Board notes baseline',
        ]);
        expect(PREDEPLOY_REQUIRED_MIGRATIONS).toContainEqual([
            '041',
            'Supplier price intelligence RLS hardening',
        ]);
        expect(PREDEPLOY_REQUIRED_MIGRATIONS).toContainEqual([
            '042',
            'Inventory WMS RLS hardening',
        ]);
        expect(PREDEPLOY_REQUIRED_MIGRATIONS).toContainEqual([
            '043',
            'Monthly closing baseline',
        ]);
    });
});
