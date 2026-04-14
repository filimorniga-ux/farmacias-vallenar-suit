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

export function resolveAppUrl(): string | null {
    const candidates = [
        process.env.APP_URL,
        process.env.NEXT_PUBLIC_APP_URL,
        process.env.BASE_URL,
        process.env.NEXT_PUBLIC_BASE_URL,
        process.env.PUBLIC_APP_URL,
    ];

    for (const candidate of candidates) {
        const valid = asAbsoluteHttpUrl(candidate);
        if (valid) return valid;
    }

    return null;
}

export function requireAppUrl(): string {
    const resolved = resolveAppUrl();
    if (resolved) {
        return resolved;
    }

    if (process.env.NODE_ENV !== 'production') {
        return 'http://localhost:3000';
    }

    throw new Error('APP_URL es obligatoria en producción');
}
