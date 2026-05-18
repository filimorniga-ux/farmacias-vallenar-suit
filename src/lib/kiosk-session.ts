import 'server-only';

import { createHmac, createHash, timingSafeEqual } from 'crypto';

export type KioskSessionMode = 'ATTENDANCE' | 'QUEUE' | 'QUEUE_DISPLAY';

export interface KioskSessionPayload {
    version: 1;
    mode: KioskSessionMode;
    locationId: string;
    authorizedBy: string;
    issuedAt: number;
    expiresAt: number;
}

const DEV_KIOSK_SECRET = 'farmacias-vallenar-dev-kiosk-secret';
const KIOSK_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function base64UrlEncode(value: string) {
    return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string) {
    return Buffer.from(value, 'base64url').toString('utf8');
}

function getKioskSessionSecret() {
    const configuredSecret = process.env.KIOSK_SESSION_SECRET || process.env.CONFIG_ENCRYPTION_KEY;
    if (!configuredSecret) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('KIOSK_SESSION_SECRET o CONFIG_ENCRYPTION_KEY es obligatorio para kioskos en producción');
        }

        return createHash('sha256').update(DEV_KIOSK_SECRET).digest();
    }

    return createHash('sha256').update(`kiosk-session:${configuredSecret}`).digest();
}

function signPayload(encodedPayload: string) {
    return createHmac('sha256', getKioskSessionSecret())
        .update(encodedPayload)
        .digest('base64url');
}

export function issueKioskSessionToken(input: {
    mode: KioskSessionMode;
    locationId: string;
    authorizedBy: string;
    now?: number;
}) {
    const issuedAt = input.now ?? Date.now();
    const payload: KioskSessionPayload = {
        version: 1,
        mode: input.mode,
        locationId: input.locationId,
        authorizedBy: input.authorizedBy,
        issuedAt,
        expiresAt: issuedAt + KIOSK_SESSION_TTL_MS,
    };

    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signature = signPayload(encodedPayload);

    return `${encodedPayload}.${signature}`;
}

export function verifyKioskSessionToken(
    token: string,
    expectedMode?: KioskSessionMode
): { valid: true; payload: KioskSessionPayload } | { valid: false; error: string } {
    if (!token || typeof token !== 'string' || !token.includes('.')) {
        return { valid: false, error: 'Token de kiosko inválido' };
    }

    const [encodedPayload, signature] = token.split('.', 2);
    const expectedSignature = signPayload(encodedPayload);

    const signatureBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (
        signatureBuffer.length !== expectedBuffer.length
        || !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
        return { valid: false, error: 'Token de kiosko inválido' };
    }

    try {
        const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as KioskSessionPayload;

        if (
            parsed.version !== 1
            || !['ATTENDANCE', 'QUEUE', 'QUEUE_DISPLAY'].includes(parsed.mode)
        ) {
            return { valid: false, error: 'Token de kiosko inválido' };
        }

        if (expectedMode && parsed.mode !== expectedMode) {
            return { valid: false, error: 'Token de kiosko inválido' };
        }

        if (!parsed.locationId || !parsed.authorizedBy || !parsed.issuedAt || !parsed.expiresAt) {
            return { valid: false, error: 'Token de kiosko inválido' };
        }

        if (parsed.expiresAt <= Date.now()) {
            return { valid: false, error: 'La sesión del kiosko expiró' };
        }

        return { valid: true, payload: parsed };
    } catch {
        return { valid: false, error: 'Token de kiosko inválido' };
    }
}
