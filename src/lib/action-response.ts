export interface ActionErrorMeta {
    code: string;
    retryable: boolean;
    correlationId: string;
    userMessage: string;
}

export interface ActionFailure extends ActionErrorMeta {
    success: false;
    error: string;
}

export type ActionResult<T> = { success: true } & T | ActionFailure;

export function createCorrelationId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `corr-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}
