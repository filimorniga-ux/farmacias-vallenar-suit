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

describe('TigerDataService fallbacks', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('usa fallback de PO cuando WMS responde success=false', async () => {
        mockGetPurchaseOrdersSecure.mockResolvedValue({
            success: false,
            error: 'No autorizado',
        });
        mockGetSupplyChainHistorySecure.mockResolvedValue({
            success: true,
            data: [
                {
                    id: 'po-1',
                    status: 'DRAFT',
                    supplier_name: 'Proveedor 1',
                    location_name: 'Sucursal Centro',
                    items_count: '2',
                    created_at: '2026-02-20T12:00:00.000Z',
                },
            ],
            total: 1,
        });

        const rows = await TigerDataService.fetchPurchaseOrders('550e8400-e29b-41d4-a716-446655440000');

        expect(mockGetPurchaseOrdersSecure).toHaveBeenCalledTimes(1);
        expect(mockGetSupplyChainHistorySecure).toHaveBeenCalledWith({
            page: 1,
            pageSize: 200,
            type: 'PO',
            locationId: '550e8400-e29b-41d4-a716-446655440000'
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].items_count).toBe(2);
    });

    it('usa fallback de shipments cuando WMS falla', async () => {
        mockGetShipmentsSecure.mockRejectedValue(new Error('fetch failed'));
        mockGetSupplyChainHistorySecure.mockResolvedValue({
            success: true,
            data: [
                {
                    id: 'sh-1',
                    status: 'IN_TRANSIT',
                    shipment_type: 'INTER_BRANCH',
                    origin_location_id: 'loc-a',
                    origin_location_name: 'Origen A',
                    location_id: 'loc-b',
                    location_name: 'Destino B',
                    created_at: '2026-02-20T13:00:00.000Z',
                    updated_at: '2026-02-20T14:00:00.000Z',
                    notes: 'En tránsito',
                    items_count: '3',
                },
            ],
            total: 1,
        });

        const rows = await TigerDataService.fetchShipments('550e8400-e29b-41d4-a716-446655440001');

        expect(mockGetShipmentsSecure).toHaveBeenCalledTimes(1);
        expect(mockGetSupplyChainHistorySecure).toHaveBeenCalledWith({
            page: 1,
            pageSize: 200,
            type: 'SHIPMENT',
            locationId: '550e8400-e29b-41d4-a716-446655440001'
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].items_count).toBe(3);
        expect(rows[0].destination_location_name).toBe('Destino B');
    });

    it('usa fallback de shipments cuando WMS responde success=true pero vacío', async () => {
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
        mockGetSupplyChainHistorySecure.mockResolvedValue({
            success: true,
            data: [
                {
                    id: 'sh-2',
                    status: 'DELIVERED',
                    shipment_type: 'INTER_BRANCH',
                    origin_location_name: 'Origen X',
                    location_name: 'Destino X',
                    created_at: '2026-02-20T15:00:00.000Z',
                    items_count: '1',
                },
            ],
            total: 1,
        });

        const rows = await TigerDataService.fetchShipments('550e8400-e29b-41d4-a716-446655440010');

        expect(mockGetSupplyChainHistorySecure).toHaveBeenCalled();
        expect(rows).toHaveLength(1);
        expect(rows[0].status).toBe('DELIVERED');
    });

    it('usa fallback global de shipments antes del histórico cuando ubicación no tiene resultados', async () => {
        mockGetShipmentsSecure
            .mockResolvedValueOnce({
                success: true,
                data: {
                    shipments: [],
                    total: 0,
                    page: 1,
                    pageSize: 100,
                    totalPages: 0,
                }
            } as any)
            .mockResolvedValueOnce({
                success: true,
                data: {
                    shipments: [
                        {
                            id: 'sh-global-1',
                            status: 'IN_TRANSIT',
                            origin_location_name: 'Bodega General',
                            destination_location_name: 'Farmacia Prat',
                            created_at: Date.now(),
                            shipment_items: [{ id: 'it-1', sku: 'SKU-1' }]
                        }
                    ],
                    total: 1,
                    page: 1,
                    pageSize: 100,
                    totalPages: 1,
                }
            } as any);

        const rows = await TigerDataService.fetchShipments('550e8400-e29b-41d4-a716-44665544abcd');

        expect(mockGetShipmentsSecure).toHaveBeenCalledTimes(2);
        expect(mockGetShipmentsSecure.mock.calls[0]?.[0]).toMatchObject({
            locationId: '550e8400-e29b-41d4-a716-44665544abcd'
        });
        expect(mockGetShipmentsSecure.mock.calls[1]?.[0]).not.toHaveProperty('locationId');
        expect(mockGetSupplyChainHistorySecure).not.toHaveBeenCalled();
        expect(rows).toHaveLength(1);
        expect(rows[0].id).toBe('sh-global-1');
    });

    it('usa fallback de PO cuando WMS responde success=true pero vacío', async () => {
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
        mockGetSupplyChainHistorySecure.mockResolvedValue({
            success: true,
            data: [
                {
                    id: 'po-2',
                    status: 'APPROVED',
                    supplier_name: 'Proveedor fallback',
                    location_name: 'Sucursal fallback',
                    items_count: '5',
                    created_at: '2026-02-20T16:00:00.000Z',
                },
            ],
            total: 1,
        });

        const rows = await TigerDataService.fetchPurchaseOrders('550e8400-e29b-41d4-a716-446655440011');

        expect(mockGetSupplyChainHistorySecure).toHaveBeenCalled();
        expect(rows).toHaveLength(1);
        expect(rows[0].items_count).toBe(5);
    });

    it('usa fallback global de PO antes del histórico cuando ubicación no tiene resultados', async () => {
        mockGetPurchaseOrdersSecure
            .mockResolvedValueOnce({
                success: true,
                data: {
                    purchaseOrders: [],
                    total: 0,
                    page: 1,
                    pageSize: 200,
                    totalPages: 0,
                }
            } as any)
            .mockResolvedValueOnce({
                success: true,
                data: {
                    purchaseOrders: [
                        {
                            id: 'po-global-1',
                            status: 'APPROVED',
                            supplier_name: 'Proveedor Corporativo',
                            items_count: 2,
                            created_at: Date.now()
                        }
                    ],
                    total: 1,
                    page: 1,
                    pageSize: 200,
                    totalPages: 1,
                }
            } as any);

        const rows = await TigerDataService.fetchPurchaseOrders('550e8400-e29b-41d4-a716-44665544abce');

        expect(mockGetPurchaseOrdersSecure).toHaveBeenCalledTimes(2);
        expect(mockGetPurchaseOrdersSecure.mock.calls[0]?.[0]).toMatchObject({
            locationId: '550e8400-e29b-41d4-a716-44665544abce'
        });
        expect(mockGetPurchaseOrdersSecure.mock.calls[1]?.[0]).not.toHaveProperty('locationId');
        expect(mockGetSupplyChainHistorySecure).not.toHaveBeenCalled();
        expect(rows).toHaveLength(1);
        expect(rows[0].id).toBe('po-global-1');
    });
});
