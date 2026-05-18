import 'server-only';

import crypto from 'crypto';
import { validateCertificate } from '@/domain/logic/sii/crypto';
import { getConfigEncryptionKey } from '@/lib/config-encryption';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { SiiAmbiente, SiiConfiguration } from '@/domain/types';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const DEFAULT_ACTECO = 477310;
const MAX_CERTIFICATE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_SII_ENVIRONMENTS = ['CERTIFICACION', 'PRODUCCION'] as const;
const ALLOWED_CERTIFICATE_EXTENSIONS = ['.pfx', '.p12'];
const ALLOWED_CERTIFICATE_MIME_TYPES = [
    'application/x-pkcs12',
    'application/pkcs12',
    'application/octet-stream',
] as const;

const CONFIG_KEYS = {
    certificatePfxBase64: 'SII_CERT_PFX_BASE64',
    certificatePassword: 'SII_CERT_PASSWORD',
    certificateCommonName: 'SII_CERT_COMMON_NAME',
    certificateExpiresAt: 'SII_CERT_EXPIRES_AT',
    lastUploadedAt: 'SII_CERT_LAST_UPLOADED_AT',
    rutEmisor: 'SII_RUT_EMISOR',
    razonSocial: 'SII_RAZON_SOCIAL',
    giro: 'SII_GIRO',
    acteco: 'SII_ACTECO',
    environment: 'SII_ENVIRONMENT',
} as const;

interface ConfigRow {
    config_key: string;
    config_value: string | null;
    is_encrypted: boolean;
}

export type SiiCertificateState = SiiConfiguration;

export interface SiiEmissionConfig {
    rutEmisor: string;
    razonSocial: string;
    giro: string;
    acteco: number;
    ambiente: SiiAmbiente;
    certificatePfxBase64: string;
    certificatePassword: string;
}

function encryptValue(plaintext: string): string {
    const key = getConfigEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decryptValue(encryptedValue: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedValue.split(':');

    if (!ivHex || !authTagHex || !encrypted) {
        throw new Error('Formato de secreto SII inválido');
    }

    const key = getConfigEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

function normalizeEnvironment(value?: string | null): SiiAmbiente {
    return value === 'PRODUCCION' ? 'PRODUCCION' : 'CERTIFICACION';
}

function getFileExtension(fileName: string) {
    const lastDotIndex = fileName.lastIndexOf('.');
    return lastDotIndex >= 0 ? fileName.slice(lastDotIndex).toLowerCase() : '';
}

async function getConfigMap() {
    const keys = Object.values(CONFIG_KEYS);
    const res = await query(
        `
            SELECT config_key, config_value, is_encrypted
            FROM system_configs
            WHERE config_key = ANY($1::text[])
        `,
        [keys]
    );

    const map = new Map<string, ConfigRow>();
    for (const row of res.rows as ConfigRow[]) {
        map.set(row.config_key, row);
    }
    return map;
}

async function upsertConfig(key: string, value: string, input?: { encrypted?: boolean; userId?: string | null; description?: string }) {
    const encrypted = input?.encrypted ?? false;
    const configValue = encrypted ? encryptValue(value) : value;

    await query(
        `
            INSERT INTO system_configs (
                config_key,
                config_value,
                is_encrypted,
                config_type,
                description,
                category,
                created_by,
                updated_by
            )
            VALUES ($1, $2, $3, $4, $5, 'SII', $6, $6)
            ON CONFLICT (config_key) DO UPDATE SET
                config_value = EXCLUDED.config_value,
                is_encrypted = EXCLUDED.is_encrypted,
                config_type = EXCLUDED.config_type,
                description = COALESCE(EXCLUDED.description, system_configs.description),
                updated_by = EXCLUDED.updated_by,
                updated_at = NOW()
        `,
        [
            key,
            configValue,
            encrypted,
            encrypted ? 'ENCRYPTED' : 'STRING',
            input?.description || null,
            input?.userId || null,
        ]
    );
}

function readConfigValue(configMap: Map<string, ConfigRow>, key: string) {
    const row = configMap.get(key);
    if (!row?.config_value) {
        return null;
    }

    return row.is_encrypted ? decryptValue(row.config_value) : row.config_value;
}

export function validateSiiCertificateFile(file: File) {
    const extension = getFileExtension(file.name);

    if (!ALLOWED_CERTIFICATE_EXTENSIONS.includes(extension)) {
        throw new Error('El certificado debe ser .pfx o .p12');
    }

    if (file.size <= 0 || file.size > MAX_CERTIFICATE_SIZE_BYTES) {
        throw new Error('El certificado supera el tamaño permitido de 5MB');
    }

    if (file.type && !ALLOWED_CERTIFICATE_MIME_TYPES.includes(file.type as (typeof ALLOWED_CERTIFICATE_MIME_TYPES)[number])) {
        throw new Error('Tipo MIME de certificado no permitido');
    }
}

export async function getSiiConfigurationSummary(): Promise<SiiCertificateState> {
    const configMap = await getConfigMap();
    const certificatePfxBase64 = readConfigValue(configMap, CONFIG_KEYS.certificatePfxBase64);
    const certificateCommonName = readConfigValue(configMap, CONFIG_KEYS.certificateCommonName);
    const certificateExpiresAt = readConfigValue(configMap, CONFIG_KEYS.certificateExpiresAt);
    const lastUploadedAt = readConfigValue(configMap, CONFIG_KEYS.lastUploadedAt);
    const rutEmisor = readConfigValue(configMap, CONFIG_KEYS.rutEmisor);
    const razonSocial = readConfigValue(configMap, CONFIG_KEYS.razonSocial);
    const giro = readConfigValue(configMap, CONFIG_KEYS.giro);
    const acteco = readConfigValue(configMap, CONFIG_KEYS.acteco);
    const ambiente = readConfigValue(configMap, CONFIG_KEYS.environment);

    return {
        id: 'SII-SERVER-CONFIG',
        rut_emisor: rutEmisor || '',
        razon_social: razonSocial || '',
        giro: giro || '',
        acteco: acteco ? Number(acteco) : DEFAULT_ACTECO,
        ambiente: normalizeEnvironment(ambiente),
        hasCertificate: Boolean(certificatePfxBase64),
        certificateCommonName: certificateCommonName || undefined,
        certificateExpiresAt: certificateExpiresAt ? Number(certificateExpiresAt) : undefined,
        lastUploadedAt: lastUploadedAt ? Number(lastUploadedAt) : undefined,
    };
}

export async function saveSiiConfiguration(input: {
    userId?: string | null;
    rutEmisor: string;
    razonSocial: string;
    giro: string;
    acteco: number;
    ambiente: SiiAmbiente;
    certificateFile?: File | null;
    certificatePassword?: string | null;
}) {
    const ambiente = normalizeEnvironment(input.ambiente);

    if (!(ALLOWED_SII_ENVIRONMENTS as readonly string[]).includes(ambiente)) {
        throw new Error('Ambiente SII inválido');
    }

    await upsertConfig(CONFIG_KEYS.rutEmisor, input.rutEmisor.trim(), { userId: input.userId, description: 'RUT emisor SII' });
    await upsertConfig(CONFIG_KEYS.razonSocial, input.razonSocial.trim(), { userId: input.userId, description: 'Razón social SII' });
    await upsertConfig(CONFIG_KEYS.giro, input.giro.trim(), { userId: input.userId, description: 'Giro SII' });
    await upsertConfig(CONFIG_KEYS.acteco, String(input.acteco || DEFAULT_ACTECO), { userId: input.userId, description: 'ACTECO SII' });
    await upsertConfig(CONFIG_KEYS.environment, ambiente, { userId: input.userId, description: 'Ambiente SII' });

    if (input.certificateFile) {
        if (!input.certificatePassword) {
            throw new Error('La contraseña del certificado es obligatoria');
        }

        validateSiiCertificateFile(input.certificateFile);

        const buffer = Buffer.from(await input.certificateFile.arrayBuffer());
        const pfxBase64 = buffer.toString('base64');
        const validationResult = await validateCertificate(pfxBase64, input.certificatePassword);

        if (!validationResult.valid) {
            throw new Error(validationResult.error || 'No se pudo validar el certificado');
        }

        const now = Date.now();

        await upsertConfig(CONFIG_KEYS.certificatePfxBase64, pfxBase64, {
            encrypted: true,
            userId: input.userId,
            description: 'Certificado PFX SII encriptado',
        });
        await upsertConfig(CONFIG_KEYS.certificatePassword, input.certificatePassword, {
            encrypted: true,
            userId: input.userId,
            description: 'Contraseña de certificado SII encriptada',
        });
        await upsertConfig(CONFIG_KEYS.certificateCommonName, validationResult.commonName || 'CERTIFICATE', {
            userId: input.userId,
            description: 'Titular del certificado SII',
        });
        await upsertConfig(CONFIG_KEYS.certificateExpiresAt, String(validationResult.expiryDate?.getTime() || now), {
            userId: input.userId,
            description: 'Vencimiento de certificado SII',
        });
        await upsertConfig(CONFIG_KEYS.lastUploadedAt, String(now), {
            userId: input.userId,
            description: 'Última carga de certificado SII',
        });

        logger.info(
            {
                userId: input.userId,
                commonName: validationResult.commonName || 'CERTIFICATE',
                expiresAt: validationResult.expiryDate?.toISOString() || null,
            },
            '[SII] Certificado guardado solo en servidor'
        );
    }

    return getSiiConfigurationSummary();
}

export async function getSiiEmissionConfig(): Promise<SiiEmissionConfig> {
    const configMap = await getConfigMap();
    const certificatePfxBase64 = readConfigValue(configMap, CONFIG_KEYS.certificatePfxBase64);
    const certificatePassword = readConfigValue(configMap, CONFIG_KEYS.certificatePassword);

    if (!certificatePfxBase64 || !certificatePassword) {
        return {
            rutEmisor: readConfigValue(configMap, CONFIG_KEYS.rutEmisor) || '76.123.456-7',
            razonSocial: readConfigValue(configMap, CONFIG_KEYS.razonSocial) || 'FARMACIAS VALLENAR LTDA',
            giro: readConfigValue(configMap, CONFIG_KEYS.giro) || 'VENTA AL POR MENOR DE PRODUCTOS FARMACEUTICOS',
            acteco: Number(readConfigValue(configMap, CONFIG_KEYS.acteco) || DEFAULT_ACTECO),
            ambiente: normalizeEnvironment(readConfigValue(configMap, CONFIG_KEYS.environment)),
            certificatePfxBase64: 'MOCK_CERT',
            certificatePassword: 'MOCK_PASS',
        };
    }

    return {
        rutEmisor: readConfigValue(configMap, CONFIG_KEYS.rutEmisor) || '',
        razonSocial: readConfigValue(configMap, CONFIG_KEYS.razonSocial) || '',
        giro: readConfigValue(configMap, CONFIG_KEYS.giro) || '',
        acteco: Number(readConfigValue(configMap, CONFIG_KEYS.acteco) || DEFAULT_ACTECO),
        ambiente: normalizeEnvironment(readConfigValue(configMap, CONFIG_KEYS.environment)),
        certificatePfxBase64,
        certificatePassword,
    };
}
