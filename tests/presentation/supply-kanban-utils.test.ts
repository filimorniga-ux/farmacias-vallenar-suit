import { describe, expect, it } from 'vitest';
import {
    buildSupplyKanbanEntries,
    resolvePOColumn,
    resolveShipmentColumn
} from '@/presentation/components/supply/supplyKanbanUtils';

describe('Supply Kanban Utils', () => {
    it('maps PO and shipment statuses to kanban columns', () => {
        expect(resolvePOColumn('DRAFT')).toBe('DRAFT');
        expect(resolvePOColumn('ORDERED')).toBe('SENT');
        expect(resolvePOColumn('RECEIVED')).toBe('RECEIVED');
        expect(resolvePOColumn('CANCELLED')).toBeNull();
        expect(resolvePOColumn(' pending_receipt ')).toBe('SENT');
        expect(resolvePOColumn('delivered')).toBe('RECEIVED');

        expect(resolveShipmentColumn('IN_TRANSIT')).toBe('SENT');
        expect(resolveShipmentColumn('DELIVERED')).toBe('RECEIVED');
        expect(resolveShipmentColumn('CANCELLED')).toBeNull();
        expect(resolveShipmentColumn('pending receipt')).toBe('SENT');
        expect(resolveShipmentColumn('received')).toBe('RECEIVED');
    });

    it('builds unified kanban entries from purchase orders and shipments', () => {
        const entries = buildSupplyKanbanEntries({
            purchaseOrders: [
                {
                    id: 'po-1',
                    status: 'DRAFT',
                    supplier_name: 'Proveedor Uno',
                    items_count: 3,
                    created_at: '2026-02-20T14:00:00.000Z'
                },
                {
                    id: 'po-2',
                    status: 'RECEIVED',
                    supplier_name: 'Proveedor Dos',
                    items: [{ sku: 'A' }],
                    created_at: '2026-02-20T13:00:00.000Z'
                }
            ],
            shipments: [
                {
                    id: 'sh-1',
                    status: 'IN_TRANSIT',
                    type: 'INTER_BRANCH',
                    origin_location_name: 'Bodega General',
                    destination_location_name: 'Farmacia Santiago',
                    items: [{ id: 'i-1' }, { id: 'i-2' }],
                    created_at: '2026-02-20T15:00:00.000Z'
                }
            ]
        });

        expect(entries).toHaveLength(3);
        expect(entries[0]).toMatchObject({
            id: 'sh-1',
            source: 'SHIPMENT',
            column: 'SENT',
            itemCount: 2
        });
        expect(entries[1]).toMatchObject({
            id: 'po-1',
            source: 'PO',
            column: 'DRAFT',
            itemCount: 3
        });
        expect(entries[2]).toMatchObject({
            id: 'po-2',
            source: 'PO',
            column: 'RECEIVED',
            itemCount: 1
        });
    });

    it('builds entries even when statuses are lowercase or spaced', () => {
        const entries = buildSupplyKanbanEntries({
            purchaseOrders: [
                {
                    id: 'po-lower',
                    status: 'pending approval',
                    supplier_name: 'Proveedor Legacy',
                    items_count: 1,
                    created_at: '2026-02-20T10:00:00.000Z'
                }
            ],
            shipments: [
                {
                    id: 'sh-lower',
                    status: 'pending receipt',
                    type: 'INTER_BRANCH',
                    origin_location_name: 'Bodega Central',
                    destination_location_name: 'Farmacia Prat',
                    items_count: 1,
                    created_at: '2026-02-20T10:10:00.000Z'
                }
            ]
        });

        expect(entries).toHaveLength(2);
        expect(entries.find((entry) => entry.id === 'po-lower')?.column).toBe('DRAFT');
        expect(entries.find((entry) => entry.id === 'sh-lower')?.column).toBe('SENT');
    });
});
