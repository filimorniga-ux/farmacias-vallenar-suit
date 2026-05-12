/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NumericKeypad } from '@/presentation/components/kiosk/NumericKeypad';

describe('NumericKeypad', () => {
    it('mantiene botones semánticos y acción de borrado accesible', () => {
        render(<NumericKeypad onDigit={vi.fn()} onDelete={vi.fn()} />);

        expect(screen.getByRole('button', { name: '1' }).getAttribute('type')).toBe('button');
        expect(screen.getByRole('button', { name: 'Borrar dígito' }).getAttribute('type')).toBe('button');
    });
});
