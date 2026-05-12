/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import OrdersPage from '@/app/procurement/orders/page';

describe('/procurement/orders', () => {
    it('mantiene el stub deshabilitado sin lenguaje legacy ni acciones nuevas', () => {
        render(<OrdersPage />);

        expect(screen.getByRole('heading', { name: /Flujo anterior no disponible/i })).toBeTruthy();
        expect(screen.getByText(/Órdenes gestionadas desde Smart Order/i)).toBeTruthy();
        expect(screen.queryByText(/Legacy/i)).toBeNull();
        expect(screen.queryByRole('link')).toBeNull();
        expect(screen.queryByRole('button')).toBeNull();
    });
});
