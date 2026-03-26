/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SiiSettings from '@/presentation/pages/settings/SiiSettings';
import type { SiiCaf, SiiConfiguration } from '@/domain/types';

const mocks = vi.hoisted(() => {
    const siiConfiguration: SiiConfiguration = {
        id: 'SII-SERVER-CONFIG',
        rut_emisor: '76.123.456-7',
        razon_social: 'Farmacias Vallenar',
        giro: 'Farmacia',
        acteco: 477310,
        ambiente: 'CERTIFICACION',
        hasCertificate: false,
    };

    return {
        siiConfiguration,
        siiCafs: [] as SiiCaf[],
        updateSiiConfigurationMock: vi.fn(),
        addCafMock: vi.fn(),
        getAvailableFoliosMock: vi.fn(() => 0),
        localStorageMock: {
            getItem: vi.fn(() => null),
            setItem: vi.fn(),
            removeItem: vi.fn(),
            clear: vi.fn(),
        },
    };
});

vi.mock('@/presentation/store/useStore', () => ({
    usePharmaStore: () => ({
        siiConfiguration: mocks.siiConfiguration,
        siiCafs: mocks.siiCafs,
        updateSiiConfiguration: mocks.updateSiiConfigurationMock,
        addCaf: mocks.addCafMock,
        getAvailableFolios: mocks.getAvailableFoliosMock,
    }),
}));

vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    },
}));

const SAFE_SUMMARY: SiiConfiguration = {
    id: 'SII-SERVER-CONFIG',
    rut_emisor: '76.123.456-7',
    razon_social: 'Farmacias Vallenar',
    giro: 'Farmacia',
    acteco: 477310,
    ambiente: 'CERTIFICACION',
    hasCertificate: true,
    certificateCommonName: 'DEMO CERTIFICATE',
    certificateExpiresAt: 1893456000000,
    lastUploadedAt: 1769472000000,
};

function mockJsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('SiiSettings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(window, 'localStorage', {
            value: mocks.localStorageMock,
            configurable: true,
        });
    });

    it('carga metadatos seguros desde el endpoint y no usa FileReader para el certificado', async () => {
        const fetchMock = vi.fn();
        const fileReaderSpy = vi.fn();

        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('FileReader', fileReaderSpy as unknown as typeof FileReader);

        fetchMock.mockResolvedValueOnce(
            mockJsonResponse({
                success: true,
                data: SAFE_SUMMARY,
            })
        );

        render(<SiiSettings />);

        expect(await screen.findByText('Certificado Cargado')).toBeTruthy();
        expect(screen.getByText('DEMO CERTIFICATE')).toBeTruthy();
        expect(fileReaderSpy).not.toHaveBeenCalled();

        vi.unstubAllGlobals();
    });

    it('sube el certificado al endpoint server-side y actualiza sólo metadatos seguros', async () => {
        const fetchMock = vi.fn();
        const fileReaderSpy = vi.fn(() => {
            throw new Error('FileReader no debe usarse en el flujo SII');
        });

        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('FileReader', fileReaderSpy as unknown as typeof FileReader);

        fetchMock
            .mockResolvedValueOnce(
                mockJsonResponse({
                    success: true,
                    data: mocks.siiConfiguration,
                })
            )
            .mockResolvedValueOnce(
                mockJsonResponse({
                    success: true,
                    data: SAFE_SUMMARY,
                })
            );

        const { container } = render(<SiiSettings />);

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        mocks.updateSiiConfigurationMock.mockClear();

        const fileInput = container.querySelector('input[type="file"][accept=".pfx,.p12"]');
        const passwordInput = screen.getByPlaceholderText('••••••') as HTMLInputElement;

        expect(fileInput).toBeInstanceOf(HTMLInputElement);

        const certificateFile = new File([Uint8Array.from([1, 2, 3])], 'certificado.pfx', {
            type: 'application/x-pkcs12',
        });

        fireEvent.change(fileInput as HTMLInputElement, {
            target: { files: [certificateFile] },
        });
        fireEvent.change(passwordInput, {
            target: { value: 'clave-secreta' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Cargar y Validar' }));

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        expect(fileReaderSpy).not.toHaveBeenCalled();

        const [, requestInit] = fetchMock.mock.calls[1] as [string, RequestInit];
        expect(requestInit.method).toBe('POST');
        expect(requestInit.body).toBeInstanceOf(FormData);

        const formData = requestInit.body as FormData;
        expect(formData.get('certificate')).toBe(certificateFile);
        expect(formData.get('certificatePassword')).toBe('clave-secreta');

        const updatedConfig = mocks.updateSiiConfigurationMock.mock.calls[0]?.[0] as SiiConfiguration;
        expect(updatedConfig).toEqual(SAFE_SUMMARY);
        expect(updatedConfig).not.toHaveProperty('certificado_pfx_base64');
        expect(updatedConfig).not.toHaveProperty('certificado_password');
        expect(window.localStorage.getItem('certificado_pfx_base64')).toBeNull();
        expect(window.localStorage.getItem('certificado_password')).toBeNull();
        expect(screen.queryByPlaceholderText('••••••')).toBeNull();

        vi.unstubAllGlobals();
    });
});
