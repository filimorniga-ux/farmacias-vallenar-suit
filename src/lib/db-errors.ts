export interface PgLikeError {
    code?: string;
    message?: string;
}

const TRANSIENT_CODES = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'EPIPE',
    'ENETUNREACH',
    'EHOSTUNREACH',
    '57P01', // admin_shutdown
    '57P02', // crash_shutdown
    '57P03', // cannot_connect_now
    '08001', // sql_client_unable_to_establish_sql_connection
    '08003', // connection_does_not_exist
    '08006', // connection_failure
]);

const TRANSIENT_MESSAGE_PATTERNS = [
    /aborted/i,
    /connection timeout/i,
    /timed out/i,
    /connection terminated/i,
    /terminat(?:ed|ion).*timeout/i,
    /socket hang up/i,
    /connection reset/i,
    /could not connect/i,
];

export function isTransientPgConnectionError(error: PgLikeError | null | undefined): boolean {
    if (!error) return false;

    if (error.code && TRANSIENT_CODES.has(error.code)) {
        return true;
    }

    const message = error.message ?? '';
    return TRANSIENT_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}
