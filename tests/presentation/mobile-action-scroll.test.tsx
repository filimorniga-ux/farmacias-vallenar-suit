// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MobileActionScroll from '@/presentation/components/ui/MobileActionScroll';

describe('MobileActionScroll', () => {
    it('mantiene acciones móviles sin encoger para evitar texto solapado', () => {
        render(
            <MobileActionScroll>
                <button>Transferir</button>
                <button>Exportar Kardex</button>
            </MobileActionScroll>,
        );

        const container = screen.getByRole('button', { name: 'Transferir' }).parentElement;

        expect(container?.className).toContain('overflow-x-auto');
        expect(container?.className).toContain('[&>*]:shrink-0');
        expect(container?.className).toContain('max-w-full');
    });
});
