import 'server-only';

import crypto from 'crypto';

const DEVELOPMENT_FALLBACK_SEED = 'farmacias-vallenar-local-dev-encryption-seed';

export function getConfigEncryptionKey(): Buffer {
    const configuredKey = process.env.CONFIG_ENCRYPTION_KEY?.trim();

    if (configuredKey) {
        if (configuredKey.length === 64) {
            return Buffer.from(configuredKey, 'hex');
        }

        return crypto.createHash('sha256').update(configuredKey).digest();
    }

    if (process.env.NODE_ENV === 'production') {
        throw new Error('CONFIG_ENCRYPTION_KEY es obligatoria en producción');
    }

    const fallbackSource = process.env.DATABASE_URL?.trim() || DEVELOPMENT_FALLBACK_SEED;
    return crypto.createHash('sha256').update(fallbackSource).digest();
}
