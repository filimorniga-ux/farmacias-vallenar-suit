import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface StoredConfigValue {
    config_value: string;
    is_encrypted: boolean;
}

type QueryParams = (string | number | boolean | Date | string[] | null | undefined)[] | undefined;

const mocks = vi.hoisted(() => ({
    configStore: new Map<string, StoredConfigValue>(),
    queryMock: vi.fn(),
    validateCertificateMock: vi.fn(),
    loggerInfoMock: vi.fn(),
    loggerWarnMock: vi.fn(),
    loggerErrorMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
    query: mocks.queryMock,
}));

vi.mock('@/domain/logic/sii/crypto', () => ({
    validateCertificate: mocks.validateCertificateMock,
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        info: mocks.loggerInfoMock,
        warn: mocks.loggerWarnMock,
        error: mocks.loggerErrorMock,
    },
}));

import {
    getSiiConfigurationSummary,
    getSiiEmissionConfig,
    saveSiiConfiguration,
    validateSiiCertificateFile,
} from '@/lib/sii-config';

function buildSelectRows(keys: string[]) {
    return keys.flatMap((key) => {
        const stored = mocks.configStore.get(key);
        if (!stored) {
            return [];
        }

        return [{
            config_key: key,
            config_value: stored.config_value,
            is_encrypted: stored.is_encrypted,
        }];
    });
}

function installQueryMock() {
    mocks.queryMock.mockImplementation(async (text: string, params?: QueryParams) => {
        if (text.includes('INSERT INTO system_configs')) {
            const insertParams = params as [string, string, boolean, string, string | null, string | null];
            const [configKey, configValue, isEncrypted] = insertParams;
            mocks.configStore.set(configKey, {
                config_value: configValue,
                is_encrypted: isEncrypted,
            });

            return {
                rows: [],
                rowCount: 1,
                command: 'INSERT',
                oid: 0,
                fields: [],
            };
        }

        if (text.includes('SELECT config_key, config_value, is_encrypted')) {
            const selectKeys = (params?.[0] as string[]) || [];
            const rows = buildSelectRows(selectKeys);
            return {
                rows,
                rowCount: rows.length,
                command: 'SELECT',
                oid: 0,
                fields: [],
            };
        }

        throw new Error(`Unexpected query in test: ${text}`);
    });
}

describe('sii-config helper', () => {
    const originalEncryptionKey = process.env.CONFIG_ENCRYPTION_KEY;

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.configStore.clear();
        process.env.CONFIG_ENCRYPTION_KEY = 'test-sii-encryption-key';
        installQueryMock();
    });

    afterEach(() => {
        if (originalEncryptionKey === undefined) {
            delete process.env.CONFIG_ENCRYPTION_KEY;
        } else {
            process.env.CONFIG_ENCRYPTION_KEY = originalEncryptionKey;
        }
    });

    it('valida extensión y tamaño del certificado', () => {
        expect(() =>
            validateSiiCertificateFile(new File(['ok'], 'certificado.p12', { type: 'application/pkcs12' }))
        ).not.toThrow();

        expect(() =>
            validateSiiCertificateFile(new File(['bad'], 'certificado.pdf', { type: 'application/pdf' }))
        ).toThrow('El certificado debe ser .pfx o .p12');

        const oversize = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'certificado.pfx', {
            type: 'application/x-pkcs12',
        });
        expect(() => validateSiiCertificateFile(oversize)).toThrow('El certificado supera el tamaño permitido de 5MB');
    });

    it('cifra y guarda configuración, y resume sólo metadatos seguros', async () => {
        mocks.validateCertificateMock.mockResolvedValueOnce({
            valid: true,
            commonName: 'DEMO CERTIFICATE',
            expiryDate: new Date('2030-01-01T00:00:00.000Z'),
        });

        const certificateBytes = Uint8Array.from([1, 2, 3, 4, 5]);
        const certificateFile = new File([certificateBytes], 'certificado.pfx', {
            type: 'application/x-pkcs12',
        });
        const rawBase64 = Buffer.from(certificateBytes).toString('base64');

        const summary = await saveSiiConfiguration({
            userId: 'admin-1',
            rutEmisor: '76.123.456-7',
            razonSocial: 'Farmacias Vallenar',
            giro: 'Farmacia',
            acteco: 477310,
            ambiente: 'CERTIFICACION',
            certificateFile,
            certificatePassword: 'clave-secreta',
        });

        expect(summary).toMatchObject({
            rut_emisor: '76.123.456-7',
            razon_social: 'Farmacias Vallenar',
            giro: 'Farmacia',
            acteco: 477310,
            ambiente: 'CERTIFICACION',
            hasCertificate: true,
            certificateCommonName: 'DEMO CERTIFICATE',
        });
        expect(summary).not.toHaveProperty('certificatePfxBase64');
        expect(summary).not.toHaveProperty('certificatePassword');

        const storedPfx = mocks.configStore.get('SII_CERT_PFX_BASE64');
        const storedPassword = mocks.configStore.get('SII_CERT_PASSWORD');

        expect(storedPfx).toBeTruthy();
        expect(storedPassword).toBeTruthy();
        expect(storedPfx?.config_value).not.toBe(rawBase64);
        expect(storedPassword?.config_value).not.toBe('clave-secreta');
        expect(storedPfx?.is_encrypted).toBe(true);
        expect(storedPassword?.is_encrypted).toBe(true);
    });

    it('lee configuración server-side y desencripta secretos sólo para emisión', async () => {
        mocks.validateCertificateMock.mockResolvedValueOnce({
            valid: true,
            commonName: 'CERT SERVER',
            expiryDate: new Date('2031-01-01T00:00:00.000Z'),
        });

        const certificateBytes = Uint8Array.from([9, 8, 7, 6]);
        const certificateFile = new File([certificateBytes], 'certificado.p12', {
            type: 'application/pkcs12',
        });
        const rawBase64 = Buffer.from(certificateBytes).toString('base64');

        await saveSiiConfiguration({
            userId: 'admin-1',
            rutEmisor: '76.123.456-7',
            razonSocial: 'Farmacias Vallenar',
            giro: 'Farmacia',
            acteco: 477310,
            ambiente: 'PRODUCCION',
            certificateFile,
            certificatePassword: 'server-secret',
        });

        const emissionConfig = await getSiiEmissionConfig();

        expect(emissionConfig).toMatchObject({
            rutEmisor: '76.123.456-7',
            razonSocial: 'Farmacias Vallenar',
            giro: 'Farmacia',
            acteco: 477310,
            ambiente: 'PRODUCCION',
            certificatePfxBase64: rawBase64,
            certificatePassword: 'server-secret',
        });
    });

    it('usa fallback controlado si no existe certificado guardado', async () => {
        mocks.configStore.set('SII_RUT_EMISOR', { config_value: '76.123.456-7', is_encrypted: false });
        mocks.configStore.set('SII_RAZON_SOCIAL', { config_value: 'Farmacias Vallenar', is_encrypted: false });
        mocks.configStore.set('SII_GIRO', { config_value: 'Farmacia', is_encrypted: false });
        mocks.configStore.set('SII_ACTECO', { config_value: '477310', is_encrypted: false });
        mocks.configStore.set('SII_ENVIRONMENT', { config_value: 'CERTIFICACION', is_encrypted: false });

        const emissionConfig = await getSiiEmissionConfig();
        const summary = await getSiiConfigurationSummary();

        expect(emissionConfig.certificatePfxBase64).toBe('MOCK_CERT');
        expect(emissionConfig.certificatePassword).toBe('MOCK_PASS');
        expect(summary.hasCertificate).toBe(false);
        expect(summary).not.toHaveProperty('certificatePfxBase64');
        expect(summary).not.toHaveProperty('certificatePassword');
    });

    it('falla de forma segura cuando falta la contraseña requerida', async () => {
        const certificateFile = new File([Uint8Array.from([1, 2, 3])], 'certificado.pfx', {
            type: 'application/x-pkcs12',
        });

        await expect(
            saveSiiConfiguration({
                userId: 'admin-1',
                rutEmisor: '76.123.456-7',
                razonSocial: 'Farmacias Vallenar',
                giro: 'Farmacia',
                acteco: 477310,
                ambiente: 'CERTIFICACION',
                certificateFile,
                certificatePassword: null,
            })
        ).rejects.toThrow('La contraseña del certificado es obligatoria');

        expect(mocks.configStore.has('SII_CERT_PFX_BASE64')).toBe(false);
        expect(mocks.configStore.has('SII_CERT_PASSWORD')).toBe(false);
    });
});
