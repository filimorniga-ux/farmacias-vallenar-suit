import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TigerDataService } from '../../src/domain/services/TigerDataService';
import { getPurchaseOrdersSecure, getShipmentsSecure } from '../../src/actions/wms-v2';
import { getSupplyChainHistorySecure } from '../../src/actions/supply-v2';

vi.mock('../../src/actions/wms-v2', () => ({
    getPurchaseOrdersSecure: vi.fn(),
    getShipmentsSecure: vi.fn(),
}));

vi.mock('../../src/actions/supply-v2', () => ({
    getSupplyChainHistorySecure: vi.fn(),
}));

const mockGetPurchaseOrdersSecure = vi.mocked(getPurchaseOrdersSecure);
const mockGetShipmentsSecure = vi.mocked(getShipmentsSecure);
const mockGetSupplyChainHistorySecure = vi.mocked(getSupplyChainHistorySecure);

describe('TigerDataService WMS readers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('devuelve [] cuando purchase orders falla y no usa fallback legacy', async () => {
        mockGetPurchaseOrdersSecure.mockResolvedValue({
            success: false,
            error: 'No autorizado',
        } as any);

        const rows = await TigerDataService.fetchPurchaseOrders('550e8400-e29b-41d4-a716-446655440000');

        expect(mockGetPurchaseOrdersSecure).toHaveBeenCalledWith({
            locationId: '550e8400-e29b-41d4-a716-446655440000',
            page: 1,
            pageSize: 100,
        });
        expect(mockGetSupplyChainHistorySecure).not.toHaveBeenCalled();
        expect(rows).toEqual([]);
    });

    it('devuelve [] cuando shipments falla y no usa fallback legacy', async () => {
        mockGetShipmentsSecure.mockRejectedValue(new Error('fetch failed'));

        const rows = await TigerDataService.fetchShipments('550e8400-e29b-41d4-a716-446655440001');

        expect(mockGetShipmentsSecure).toHaveBeenCalledWith({
            locationId: '550e8400-e29b-41d4-a716-446655440001',
            page: 1,
            pageSize: 100,
        });
        expect(mockGetSupplyChainHistorySecure).not.toHaveBeenCalled();
        expect(rows).toEqual([]);
    });

    it('devuelve [] cuando shipments responde success=true pero vacío', async () => {
        mockGetShipmentsSecure.mockResolvedValue({
            success: true,
            data: {
                shipments: [],
                total: 0,
                page: 1,
                pageSize: 100,
                totalPages: 0,
            }
        } as any);

        const rows = await TigerDataService.fetchShipments('550e8400-e29b-41d4-a716-446655440010');

        expect(mockGetSupplyChainHistorySecure).not.toHaveBeenCalled();
        expect(rows).toEqual([]);
    });

    it('consulta WMS global cuando el locationId no es UUID válido', async () => {
        mockGetShipmentsSecure.mockResolvedValue({
            success: true,
            data: {
                shipments: [{ id: 'sh-global-1' }],
                total: 1,
                page: 1,
                pageSize: 100,
                totalPages: 1,
            }
        } as any);

        const rows = await TigerDataService.fetchShipments('not-a-uuid');

        expect(mockGetShipmentsSecure).toHaveBeenCalledWith({
            locationId: undefined,
            page: 1,
            pageSize: 100,
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].id).toBe('sh-global-1');
    });

    it('devuelve [] cuando purchase orders responde success=true pero vacío', async () => {
        mockGetPurchaseOrdersSecure.mockResolvedValue({
            success: true,
            data: {
                purchaseOrders: [],
                total: 0,
                page: 1,
                pageSize: 100,
                totalPages: 0,
            }
        } as any);

        const rows = await TigerDataService.fetchPurchaseOrders('550e8400-e29b-41d4-a716-446655440011');

        expect(mockGetSupplyChainHistorySecure).not.toHaveBeenCalled();
        expect(rows).toEqual([]);
    });

    it('consulta purchase orders globales cuando el locationId no es UUID válido', async () => {
        mockGetPurchaseOrdersSecure.mockResolvedValue({
            success: true,
            data: {
                purchaseOrders: [{ id: 'po-global-1' }],
                total: 1,
                page: 1,
                pageSize: 100,
                totalPages: 1,
            }
        } as any);

        const rows = await TigerDataService.fetchPurchaseOrders('not-a-uuid');

        expect(mockGetPurchaseOrdersSecure).toHaveBeenCalledWith({
            locationId: undefined,
            page: 1,
            pageSize: 100,
        });
        expect(mockGetSupplyChainHistorySecure).not.toHaveBeenCalled();
        expect(rows).toHaveLength(1);
        expect(rows[0].id).toBe('po-global-1');
    });
});
