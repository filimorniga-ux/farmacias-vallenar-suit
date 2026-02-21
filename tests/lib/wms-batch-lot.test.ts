import { describe, expect, it } from 'vitest';
import {
    buildDispatchLotNumber,
    buildTransferLotNumber,
    extractTransferLotColorKey,
    getTransferLotColor,
    getTransferLotColorLabel,
    getTransferLotVisualTag,
} from '@/lib/wms-batch-lot';

describe('WMS Batch Lot Utils', () => {
    it('should generate transfer lots with deterministic color token', () => {
        const first = buildTransferLotNumber('550e8400-e29b-41d4-a716-446655440200', 0);
        const second = buildTransferLotNumber('550e8400-e29b-41d4-a716-446655440200', 1);

        expect(first).toBe('TRF-550E8400-001-TURQUESA');
        expect(second).toBe('TRF-550E8400-002-LIMA');
    });

    it('should cycle transfer colors across item indexes', () => {
        const first = getTransferLotColor(0);
        const seventh = getTransferLotColor(6);
        expect(first.key).toBe('TURQUESA');
        expect(seventh.key).toBe('TURQUESA');
    });

    it('should parse transfer color key and label from lot number', () => {
        const key = extractTransferLotColorKey('TRF-550E8400-003-AMBAR');
        const label = getTransferLotColorLabel('TRF-550E8400-003-AMBAR');
        const visual = getTransferLotVisualTag('TRF-550E8400-003-AMBAR');

        expect(key).toBe('AMBAR');
        expect(label).toBe('Ambar');
        expect(visual?.className).toContain('amber');
    });

    it('should not assign transfer color to dispatch lots', () => {
        const dispatchLot = buildDispatchLotNumber('550e8400-e29b-41d4-a716-446655440200', 0);
        expect(dispatchLot).toBe('DSP-550E8400-001');
        expect(extractTransferLotColorKey(dispatchLot)).toBeNull();
        expect(getTransferLotColorLabel(dispatchLot)).toBeNull();
    });
});
