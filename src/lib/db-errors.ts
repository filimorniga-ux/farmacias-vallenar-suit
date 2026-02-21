export interface PgLikeError {
    code?: string;
    message?: string;
}

export type DbErrorCode =
    | 'DB_TIMEOUT'
    | 'DB_AUTH'
    | 'DB_DNS'
    | 'DB_UNAVAILABLE'
    | 'DB_UNKNOWN';

export interface ClassifiedDbError {
    code: DbErrorCode;
    retryable: boolean;
    technicalMessage: string;
    userMessage: string;
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

const AUTH_FAILURE_CODES = new Set([
    '28P01', // invalid_password
    '28000', // invalid_authorization_specification
]);

const DNS_FAILURE_CODES = new Set([
    'ENOTFOUND',
    'EAI_AGAIN',
]);

export function isTransientPgConnectionError(error: PgLikeError | null | undefined): boolean {
    if (!error) return false;

    if (error.code && TRANSIENT_CODES.has(error.code)) {
        return true;
    }

    const message = error.message ?? '';
    return TRANSIENT_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

export function classifyPgError(error: unknown): ClassifiedDbError {
    const pgError = (error ?? {}) as PgLikeError;
    const technicalMessage = pgError.message || 'Unknown DB error';
    const code = pgError.code || '';

    if (AUTH_FAILURE_CODES.has(code)) {
        return {
            code: 'DB_AUTH',
            retryable: false,
            technicalMessage,
            userMessage: 'Error de autenticacion con base de datos.',
        };
    }

    if (DNS_FAILURE_CODES.has(code) || /ENOTFOUND|EAI_AGAIN|dns/i.test(technicalMessage)) {
        return {
            code: 'DB_DNS',
            retryable: true,
            technicalMessage,
            userMessage: 'No se pudo resolver el servicio de datos.',
        };
    }

    if (isTransientPgConnectionError(pgError)) {
        return {
            code: 'DB_TIMEOUT',
            retryable: true,
            technicalMessage,
            userMessage: 'Servicio temporalmente no disponible. Intente nuevamente en unos minutos.',
        };
    }

    if (/ECONNREFUSED|08001|08003|08006|could not connect/i.test(`${code} ${technicalMessage}`)) {
        return {
            code: 'DB_UNAVAILABLE',
            retryable: true,
            technicalMessage,
            userMessage: 'Servicio de datos no disponible temporalmente.',
        };
    }

    return {
        code: 'DB_UNKNOWN',
        retryable: false,
        technicalMessage,
        userMessage: 'Ocurrio un error inesperado en el servicio de datos.',
    };
}
