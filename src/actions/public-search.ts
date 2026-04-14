'use server';

import { searchPublicProductsSecure } from '@/actions/public-search-v2';

export interface PublicProduct {
    id: number;
    name: string;
    dci: string | null;
    status: 'Disponible' | 'Agotado';
}

export async function searchPublicProducts(term: string): Promise<PublicProduct[]> {
    const result = await searchPublicProductsSecure(term);
    if (!result.success || !result.data) {
        return [];
    }

    return result.data.map((product) => ({
        id: Number(product.id),
        name: product.name,
        dci: product.dci,
        status: product.status,
    }));
}
