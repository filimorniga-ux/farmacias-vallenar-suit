import { getUsersForLoginSecure } from '@/actions/sync-v2';
import * as Sentry from '@sentry/nextjs';
import { createCorrelationId, type ActionFailure } from '@/lib/action-response';
import { EmployeeProfile } from '@/domain/types';

/**
 * Helper seguro para cargar usuarios en el login
 * Se usa cuando el store aún no tiene datos (por falta de sesión)
 */
export type LoginUsersResult =
    | { success: true; data: EmployeeProfile[] }
    | ActionFailure;

export async function getUsersForLogin(): Promise<LoginUsersResult> {
    try {
        const result = await getUsersForLoginSecure();
        if (result.success) {
            return { success: true, data: result.data as unknown as EmployeeProfile[] };
        }

        const failure = result;
        const correlationId = failure.correlationId || createCorrelationId();
        const userMessage = failure.userMessage || failure.error || 'No fue posible cargar usuarios para iniciar sesión.';

        return {
            success: false,
            error: userMessage,
            code: failure.code || 'AUTH_USERS_FETCH',
            retryable: failure.retryable ?? false,
            correlationId,
            userMessage,
        };
    } catch (error: unknown) {
        const correlationId = createCorrelationId();
        Sentry.captureException(error, {
            tags: { module: 'login-helper', action: 'getUsersForLogin' },
            extra: { correlationId },
        });

        return {
            success: false,
            error: 'No fue posible cargar usuarios para iniciar sesión.',
            code: 'AUTH_USERS_FETCH',
            retryable: true,
            correlationId,
            userMessage: 'No fue posible cargar usuarios para iniciar sesión.',
        };
    }
}
