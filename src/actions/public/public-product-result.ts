import { parseProductDetails } from '@/lib/product-parser';

export interface ProductResult {
    id: string;
    name: string;
    sku: string;
    is_bioequivalent: boolean;
    stock: number | null;
    price: number | null;
    availabilityStatus: 'Disponible' | 'Agotado';
    priceLabel: string;
    location_name?: string;
    description?: string;
    format?: string;
    laboratory?: string;
    category?: string;
    action?: string;
    dci?: string;
    units_per_box?: number;
    isp_register?: string;
}

export const PUBLIC_PRICE_LABEL = 'Consultar en local';

export function buildPublicProductResult(row: {
    id: string;
    name: string;
    sku?: string | null;
    is_bioequivalent?: boolean | null;
    laboratory?: string | null;
    dci?: string | null;
    format?: string | null;
    isp_register?: string | null;
    units_per_box?: number | null;
    stock?: number | string | null;
}): ProductResult {
    const details = parseProductDetails(
        row.name,
        row.units_per_box ?? undefined,
        row.dci,
        row.laboratory,
        row.format
    );

    return {
        id: row.id,
        name: row.name,
        sku: row.sku || 'S/SKU',
        is_bioequivalent: row.is_bioequivalent || false,
        stock: null,
        price: null,
        availabilityStatus: Number(row.stock || 0) > 0 ? 'Disponible' : 'Agotado',
        priceLabel: PUBLIC_PRICE_LABEL,
        laboratory: details.lab || 'Generico',
        category: 'Farmacia',
        action: '',
        dci: details.dci || '',
        units_per_box: details.units,
        format: details.format || '',
        isp_register: row.isp_register || '',
        location_name: ''
    };
}
