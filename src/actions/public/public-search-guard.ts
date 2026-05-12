import { unstable_noStore as noStore } from 'next/cache';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';

const RATE_LIMIT_PER_MINUTE = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_PUBLIC_SEARCH_TERM_LENGTH = 100;
const MAX_PUBLIC_SEARCH_LIMIT = 50;
const MAX_PUBLIC_SEARCH_PAGE = 100;

type PublicSearchNamespace =
    | 'product-search'
    | 'product-browse'
    | 'bioequivalent-search'
    | 'inventory-match'
    | 'active-ingredient-list'
    | 'match-active-ingredient';

const publicSearchRateLimits = new Map<string, { count: number; resetAt: number }>();

async function getClientIP(): Promise<string> {
    try {
        const headersList = await headers();
        return headersList.get('x-forwarded-for')?.split(',')[0]?.trim()
            || headersList.get('x-real-ip')
            || 'unknown';
    } catch {
        return 'unknown';
    }
}

function checkPublicSearchRateLimit(namespace: PublicSearchNamespace, ip: string): boolean {
    const now = Date.now();
    const key = `${namespace}:${ip}`;
    const entry = publicSearchRateLimits.get(key);

    if (!entry || now > entry.resetAt) {
        publicSearchRateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }

    if (entry.count >= RATE_LIMIT_PER_MINUTE) {
        return false;
    }

    entry.count++;
    return true;
}

export async function enforcePublicSearchGuard(namespace: PublicSearchNamespace): Promise<boolean> {
    noStore();

    const ip = await getClientIP();
    if (!checkPublicSearchRateLimit(namespace, ip)) {
        logger.warn({ ip, namespace }, '[PublicSearch] Rate limit exceeded');
        return false;
    }

    return true;
}

export function normalizePublicSearchTerm(term: unknown, maxLength = MAX_PUBLIC_SEARCH_TERM_LENGTH): string {
    return String(term || '')
        .normalize('NFC')
        .replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s\-.]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

export function normalizePublicSearchPage(page: unknown): number {
    const parsed = Number(page);
    if (!Number.isFinite(parsed)) return 1;
    return Math.min(Math.max(Math.trunc(parsed), 1), MAX_PUBLIC_SEARCH_PAGE);
}

export function normalizePublicSearchLimit(limit: unknown): number {
    const parsed = Number(limit);
    if (!Number.isFinite(parsed)) return MAX_PUBLIC_SEARCH_LIMIT;
    return Math.min(Math.max(Math.trunc(parsed), 1), MAX_PUBLIC_SEARCH_LIMIT);
}

export function resetPublicSearchRateLimitsForTests() {
    publicSearchRateLimits.clear();
}
