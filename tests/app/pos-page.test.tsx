/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/presentation/components/POSMainScreen', () => ({
    __esModule: true,
    default: () => <div data-testid="pos-main-screen">POS avanzado</div>,
}));

describe('/app/pos/page', () => {
    it('monta el POS completo y no la pantalla simplificada de caja', async () => {
        const { default: PosPage } = await import('@/app/pos/page');

        render(<PosPage />);

        expect(screen.getByTestId('pos-main-screen').textContent).toContain('POS avanzado');
        expect(screen.queryByTestId('caja-page')).toBeNull();
    });
});
