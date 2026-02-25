/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TransferExecutionModal from '@/presentation/components/supply/TransferExecutionModal';
import { createPurchaseOrderSecure } from '@/actions/supply-v2';
import { toast } from 'sonner';

vi.mock('@/actions/supply-v2', () => ({
    createPurchaseOrderSecure: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

const mockCreatePurchaseOrderSecure = vi.mocked(createPurchaseOrderSecure);

describe('TransferExecutionModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCreatePurchaseOrderSecure.mockResolvedValue({ success: true, orderId: 'po-test-1' });
    });

    it('crea solicitud interna en estado DRAFT en lugar de transferir inmediatamente', async () => {
        const onSuccess = vi.fn();

        render(
            <TransferExecutionModal
                isOpen={true}
                onClose={vi.fn()}
                items={[
                    {
                        sku: 'SKU-001',
                        product_name: 'Producto Test',
                        quantity: 5,
                        source_location_id: '550e8400-e29b-41d4-a716-446655440500',
                        source_location_name: 'Farmacia Origen',
                    },
                ]}
                targetLocationId="550e8400-e29b-41d4-a716-446655440600"
                targetLocationName="Farmacia Destino"
                targetWarehouseId="550e8400-e29b-41d4-a716-446655440700"
                userId="1719073d-9da1-40d7-9dce-28ac3a415a6b"
                onSuccess={onSuccess}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Crear Solicitud' }));

        await waitFor(() => {
            expect(mockCreatePurchaseOrderSecure).toHaveBeenCalledTimes(1);
        });

        const payload = mockCreatePurchaseOrderSecure.mock.calls[0]?.[0] as {
            status?: string;
            supplierId?: string;
            targetWarehouseId?: string;
            notes?: string;
            items?: Array<{ sku: string; quantity: number }>;
        };

        expect(payload.status).toBe('DRAFT');
        expect(payload.supplierId).toBe('TRANSFER');
        expect(payload.targetWarehouseId).toBe('550e8400-e29b-41d4-a716-446655440700');
        expect(payload.notes).toContain('[TRANSFER_REQUEST]');
        expect(payload.items?.[0]).toMatchObject({ sku: 'SKU-001', quantity: 5 });
        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect(toast.success).toHaveBeenCalledWith('✅ 1 solicitud(es) de traspaso creadas (estado: solicitada)');
    });

    it('muestra error cuando falta bodega destino', async () => {
        render(
            <TransferExecutionModal
                isOpen={true}
                onClose={vi.fn()}
                items={[
                    {
                        sku: 'SKU-001',
                        product_name: 'Producto Test',
                        quantity: 5,
                        source_location_id: '550e8400-e29b-41d4-a716-446655440500',
                        source_location_name: 'Farmacia Origen',
                    },
                ]}
                targetLocationId="550e8400-e29b-41d4-a716-446655440600"
                targetLocationName="Farmacia Destino"
                userId="1719073d-9da1-40d7-9dce-28ac3a415a6b"
                onSuccess={vi.fn()}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Crear Solicitud' }));

        expect(mockCreatePurchaseOrderSecure).not.toHaveBeenCalled();
        expect(toast.error).toHaveBeenCalledWith('No se encontró bodega destino para crear la solicitud');
    });
});

