/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WMSLocationPicker } from '@/presentation/components/wms/WMSLocationPicker';
import { getLocationsSecure, getWarehousesByLocationSecure } from '@/actions/locations-v2';
import { Location } from '@/domain/types';

vi.mock('@/actions/locations-v2', () => ({
    getLocationsSecure: vi.fn(),
    getWarehousesByLocationSecure: vi.fn(),
}));

const mockGetLocationsSecure = vi.mocked(getLocationsSecure);
const mockGetWarehousesByLocationSecure = vi.mocked(getWarehousesByLocationSecure);

const makeLocation = (overrides: Partial<Location>): Location => ({
    id: 'loc-default',
    type: 'STORE',
    name: 'Sucursal Demo',
    address: '',
    associated_kiosks: [],
    parent_id: undefined,
    default_warehouse_id: undefined,
    config: undefined,
    is_active: true,
    ...overrides,
});

describe('WMSLocationPicker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetWarehousesByLocationSecure.mockResolvedValue({ success: true, data: [] });
    });

    it('en despacho solo permite destinos de tipo opuesto (sucursal -> bodega)', async () => {
        mockGetLocationsSecure.mockResolvedValue({
            success: true,
            data: [
                makeLocation({ id: 'loc-1', name: 'Sucursal Actual', default_warehouse_id: 'wh-1' }),
                makeLocation({ id: 'loc-2', name: 'Sucursal Norte', default_warehouse_id: 'wh-2' }),
                makeLocation({ id: 'loc-3', name: 'Bodega Central', type: 'HQ', default_warehouse_id: 'wh-3' }),
            ],
        });

        const onDestinationChange = vi.fn();

        render(
            <WMSLocationPicker
                mode="destination"
                currentLocationId="loc-1"
                currentLocationName="Sucursal Actual"
                onDestinationChange={onDestinationChange}
            />
        );

        const select = await screen.findByRole('combobox');
        const options = Array.from(select.querySelectorAll('option')).map(o => o.textContent || '');
        expect(options.some(opt => opt.includes('Sucursal Norte'))).toBe(false);
        expect(options.some(opt => opt.includes('Bodega Central'))).toBe(true);

        fireEvent.change(select, { target: { value: 'loc-3' } });

        expect(onDestinationChange).toHaveBeenCalledWith('loc-3', 'Bodega Central');
    });

    it('en transferencia solo permite mismo tipo y resuelve sucursales sin default_warehouse_id', async () => {
        mockGetLocationsSecure.mockResolvedValue({
            success: true,
            data: [
                makeLocation({ id: 'loc-1', name: 'Sucursal Actual', default_warehouse_id: 'wh-1' }),
                makeLocation({ id: 'loc-2', name: 'Sucursal Norte', default_warehouse_id: undefined }),
                makeLocation({ id: 'loc-3', name: 'Bodega Central', type: 'HQ', default_warehouse_id: 'wh-3' }),
            ],
        });
        mockGetWarehousesByLocationSecure.mockImplementation(async (locationId: string) => {
            if (locationId === 'loc-2') {
                return { success: true, data: [{ id: 'wh-2', name: 'Bodega Norte' }] };
            }
            return { success: true, data: [] };
        });

        const onDestinationChange = vi.fn();

        render(
            <WMSLocationPicker
                mode="both"
                currentLocationId="loc-1"
                selectedOrigin="wh-1"
                selectedDestination=""
                onOriginChange={vi.fn()}
                onDestinationChange={onDestinationChange}
            />
        );

        const selects = await screen.findAllByRole('combobox');
        const destinationSelect = selects[1];
        const options = Array.from(destinationSelect.querySelectorAll('option')).map(o => o.textContent || '');
        expect(options.some(opt => opt.includes('Sucursal Norte'))).toBe(true);
        expect(options.some(opt => opt.includes('Bodega Central'))).toBe(false);

        fireEvent.change(destinationSelect, { target: { value: 'wh-2' } });

        expect(onDestinationChange).toHaveBeenCalledWith('wh-2', 'Sucursal Norte');
    });

    it('muestra estado sin destinos cuando no hay otra ubicación disponible', async () => {
        mockGetLocationsSecure.mockResolvedValue({
            success: true,
            data: [
                makeLocation({ id: 'loc-1', name: 'Sucursal Única', default_warehouse_id: 'wh-1' }),
            ],
        });

        render(
            <WMSLocationPicker
                mode="destination"
                currentLocationId="loc-1"
                onDestinationChange={vi.fn()}
            />
        );

        const select = await screen.findByRole('combobox') as HTMLSelectElement;

        await waitFor(() => {
            expect(select.disabled).toBe(true);
        });

        expect(select.options[0]?.textContent).toContain('No hay bodegas destino disponibles');
    });
});
