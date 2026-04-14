export type PreferredPublicContext = {
    id: string;
    name: string;
    type: 'STORE' | 'WAREHOUSE' | 'HQ';
};

type StorageLike = Pick<Storage, 'getItem'>;

export function readPreferredPublicContext(storage?: StorageLike | null): PreferredPublicContext | null {
    if (!storage) return null;

    const id = storage.getItem('preferred_location_id');
    if (!id) return null;

    const rawType = storage.getItem('preferred_location_type');
    const type: PreferredPublicContext['type'] =
        rawType === 'WAREHOUSE' || rawType === 'HQ' ? rawType : 'STORE';

    return {
        id,
        name: storage.getItem('preferred_location_name') || 'Sucursal Identificada',
        type,
    };
}
