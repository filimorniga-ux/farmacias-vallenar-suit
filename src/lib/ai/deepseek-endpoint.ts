const INTERNAL_DEEPSEEK_OCR_PATH = '/api/ai/deepseek-ocr';

function asAbsoluteHttpUrl(value: string | null | undefined): string | null {
    if (!value) return null;

    const trimmed = value.trim();
    if (!trimmed) return null;

    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return null;
        }
        return parsed.toString();
    } catch {
        return null;
    }
}

function resolvePublicAppUrl(): string | null {
    const candidates = [
        process.env.NEXT_PUBLIC_APP_URL,
        process.env.APP_URL,
        process.env.PUBLIC_APP_URL,
    ];

    for (const candidate of candidates) {
        const valid = asAbsoluteHttpUrl(candidate ?? null);
        if (valid) return valid;
    }

    return null;
}

export function getDeepSeekInternalEndpoint(): string | null {
    const appUrl = resolvePublicAppUrl();
    if (!appUrl) return null;

    try {
        return new URL(INTERNAL_DEEPSEEK_OCR_PATH, appUrl).toString();
    } catch {
        return null;
    }
}

export function resolveDeepSeekOcrEndpoint(configuredEndpoint: string | null): string | null {
    const candidates = [
        configuredEndpoint,
        process.env.AI_DEEPSEEK_OCR_ENDPOINT ?? null,
        getDeepSeekInternalEndpoint(),
    ];

    for (const candidate of candidates) {
        const valid = asAbsoluteHttpUrl(candidate);
        if (valid) return valid;
    }

    return null;
}

export function getInternalDeepSeekTokenHeader(): string | null {
    const value = process.env.AI_INTERNAL_ENDPOINT_TOKEN;
    if (!value) return null;

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export function isInternalDeepSeekRoute(endpoint: string): boolean {
    try {
        const parsed = new URL(endpoint);
        return parsed.pathname === INTERNAL_DEEPSEEK_OCR_PATH;
    } catch {
        return false;
    }
}

