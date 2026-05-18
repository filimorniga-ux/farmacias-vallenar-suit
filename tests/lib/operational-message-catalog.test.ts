import { describe, expect, it } from 'vitest';
import {
    OPERATIONAL_AUTHORITY_LABELS,
    OPERATIONAL_CONTEXT_ORIGIN_LABELS,
    OPERATIONAL_CONTEXT_STATUS_LABELS,
    OPERATIONAL_REJECTION_REASON_LABELS,
    OPERATIONAL_VISIBLE_SEVERITY_LABELS,
} from '@/lib/operational-message-catalog';

describe('operational-message-catalog', () => {
    it('congela estados visibles de contexto compartidos', () => {
        expect(OPERATIONAL_CONTEXT_STATUS_LABELS).toEqual({
            accepted: 'Contexto aceptado',
            rejected: 'Contexto no aplicado',
            ignored: 'Contexto ignorado',
        });
    });

    it('mantiene origen, autoridad, motivos y severidad como vocabulario mínimo', () => {
        expect(Object.values(OPERATIONAL_CONTEXT_ORIGIN_LABELS)).toEqual([
            'Sesión validada',
            'Contexto heredado validado',
            'Selección manual',
            'Filtros heredados validados',
        ]);
        expect(Object.values(OPERATIONAL_AUTHORITY_LABELS)).toEqual([
            'URL sin autoridad',
            'Servidor como fuente de verdad',
            'Prefill seguro',
        ]);
        expect(Object.values(OPERATIONAL_REJECTION_REASON_LABELS)).toEqual([
            'Fuera de scope',
            'Inconsistente',
            'Incompleto',
            'Inválido',
        ]);
        expect(Object.values(OPERATIONAL_VISIBLE_SEVERITY_LABELS)).toEqual([
            'info',
            'warning',
            'critical',
        ]);
    });
});
