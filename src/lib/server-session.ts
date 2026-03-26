import 'server-only';

import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { query } from '@/lib/db';

export interface ValidatedSession {
    userId: string;
    role: string;
    locationId?: string;
    userName: string;
    tokenVersion: number;
    sessionToken: string;
}

const SESSION_COOKIE_NAMES = [
    'user_id',
    'user_role',
    'user_name',
    'user_location',
    'session_token',
    'user_token_version',
] as const;

export const SESSION_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
};

type SessionCookieName = (typeof SESSION_COOKIE_NAMES)[number];

interface SessionCookieStore {
    get(name: string): { value: string } | undefined;
    set(name: string, value: string, options: Record<string, unknown>): void;
}

function expireCookie(cookieStore: SessionCookieStore, name: SessionCookieName) {
    cookieStore.set(name, '', {
        ...SESSION_COOKIE_OPTIONS,
        expires: new Date(0),
    });
}

function getLocationId(cookieStore: SessionCookieStore, assignedLocationId?: string | null) {
    return cookieStore.get('user_location')?.value || assignedLocationId || undefined;
}

function parseTokenVersion(rawValue?: string) {
    if (!rawValue) {
        return null;
    }

    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed < 1) {
        return null;
    }

    return parsed;
}

export async function createServerSession(input: {
    userId: string;
    userName: string;
    role: string;
    locationId?: string | null;
}) {
    const sessionToken = randomBytes(32).toString('hex');

    const result = await query(
        `
            UPDATE users
            SET session_token = $2,
                token_version = COALESCE(token_version, 1),
                updated_at = NOW()
            WHERE id = $1
            RETURNING token_version
        `,
        [input.userId, sessionToken]
    );

    if ((result.rowCount ?? 0) === 0) {
        throw new Error('No fue posible crear la sesión');
    }

    const tokenVersion = Number(result.rows[0]?.token_version) || 1;
    const cookieStore = await cookies();

    cookieStore.set('user_id', input.userId, SESSION_COOKIE_OPTIONS);
    cookieStore.set('user_name', input.userName, SESSION_COOKIE_OPTIONS);
    cookieStore.set('session_token', sessionToken, SESSION_COOKIE_OPTIONS);
    cookieStore.set('user_token_version', String(tokenVersion), SESSION_COOKIE_OPTIONS);

    // Transitional compatibility cookie. Do not use as authority.
    cookieStore.set('user_role', input.role, SESSION_COOKIE_OPTIONS);

    if (input.locationId) {
        cookieStore.set('user_location', input.locationId, SESSION_COOKIE_OPTIONS);
    } else {
        expireCookie(cookieStore, 'user_location');
    }

    return { sessionToken, tokenVersion };
}

export async function getValidatedSession(): Promise<ValidatedSession | null> {
    try {
        const cookieStore = await cookies();
        const userId = cookieStore.get('user_id')?.value;
        const sessionToken = cookieStore.get('session_token')?.value;
        const cookieTokenVersion = parseTokenVersion(cookieStore.get('user_token_version')?.value);

        if (!userId || !sessionToken || !cookieTokenVersion) {
            return null;
        }

        const result = await query(
            `
                SELECT id, name, role, assigned_location_id, token_version, session_token, is_active
                FROM users
                WHERE id = $1
            `,
            [userId]
        );

        if ((result.rowCount ?? 0) === 0) {
            return null;
        }

        const user = result.rows[0];
        const dbTokenVersion = Number(user.token_version) || 1;

        if (!user.is_active) {
            return null;
        }

        if (!user.session_token || user.session_token !== sessionToken) {
            return null;
        }

        if (dbTokenVersion !== cookieTokenVersion) {
            return null;
        }

        return {
            userId: user.id,
            role: user.role,
            locationId: getLocationId(cookieStore, user.assigned_location_id),
            userName: user.name || cookieStore.get('user_name')?.value || 'Usuario',
            tokenVersion: dbTokenVersion,
            sessionToken,
        };
    } catch {
        return null;
    }
}

export async function invalidateCurrentSession() {
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const sessionToken = cookieStore.get('session_token')?.value;

    if (userId && sessionToken) {
        try {
            await query(
                `
                    UPDATE users
                    SET session_token = NULL,
                        updated_at = NOW()
                    WHERE id = $1
                    AND session_token = $2
                `,
                [userId, sessionToken]
            );
        } catch {
            // Best-effort invalidation: local cookie cleanup still happens below.
        }
    }

    for (const cookieName of SESSION_COOKIE_NAMES) {
        expireCookie(cookieStore, cookieName);
    }
}
