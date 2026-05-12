/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HumanResourcesDashboard from '@/presentation/components/hr/HumanResourcesDashboard';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('@/actions/users-v2', () => ({
    updateUserSecure: vi.fn(),
}));

vi.mock('@/presentation/components/hr/EmployeeModal', () => ({
    EmployeeModal: () => null,
}));

describe('HumanResourcesDashboard mobile layout', () => {
    it('usa selector táctil en móvil y conserva controles de 44px', () => {
        render(
            <HumanResourcesDashboard
                employees={[]}
                liveAttendance={[]}
                initialHistory={[]}
            />
        );

        const mobileSelector = screen.getByLabelText('Vista de Recursos Humanos');
        expect(mobileSelector.className).toContain('h-11');

        fireEvent.change(mobileSelector, { target: { value: 'history' } });

        const exportButton = screen.getByRole('button', { name: 'Exportar PDF/Excel' });
        expect(exportButton.className).toContain('min-h-11');
        expect(screen.getByText('No hay registros recientes.')).toBeTruthy();
    });
});
