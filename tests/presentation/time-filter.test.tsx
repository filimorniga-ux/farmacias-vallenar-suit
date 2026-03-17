/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TimeFilter from '@/presentation/components/bi/TimeFilter';

describe('TimeFilter', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-17T12:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('aplica presets desde el selector móvil sin solapar controles', () => {
        const onFilterChange = vi.fn();

        const { container } = render(<TimeFilter onFilterChange={onFilterChange} />);

        const [fromInput, toInput] = Array.from(container.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
        const presetSelect = screen.getByLabelText('Seleccionar rango predefinido');

        fireEvent.change(presetSelect, { target: { value: 'current_month' } });

        expect(fromInput.value).toBe('2026-03-01');
        expect(toInput.value).toBe('2026-03-17');

        fireEvent.click(screen.getByRole('button', { name: 'Aplicar Filtros' }));

        expect(onFilterChange).toHaveBeenCalledTimes(1);
        expect(onFilterChange.mock.calls[0][0].from.toISOString()).toContain('2026-03-01');
        expect(onFilterChange.mock.calls[0][0].to).toBeInstanceOf(Date);
    });
});
