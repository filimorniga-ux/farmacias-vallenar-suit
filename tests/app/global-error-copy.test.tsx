/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GlobalError from '@/app/global-error';

describe('global-error', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('muestra copy global de producto sin versionado ni Suit Enterprise', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});

        render(
            <GlobalError
                error={new Error('fallo controlado')}
                reset={vi.fn()}
            />
        );

        expect(screen.getByText(/Farmacias Vallenar Suite/i)).toBeTruthy();
        expect(screen.queryByText(/v2\.1/i)).toBeNull();
        expect(screen.queryByText(/Suit Enterprise/i)).toBeNull();
        expect(screen.queryByText(/via Farmacias Vallenar Suit/i)).toBeNull();
    });
});
