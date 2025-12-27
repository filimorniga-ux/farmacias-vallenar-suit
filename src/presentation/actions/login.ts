import { getUsersForLoginSecure } from '@/actions/sync-v2';
import { EmployeeProfile } from '@/domain/types';

/**
 * Helper seguro para cargar usuarios en el login
 * Se usa cuando el store aún no tiene datos (por falta de sesión)
 */
export async function getUsersForLogin(): Promise<EmployeeProfile[]> {
    try {
        const result = await getUsersForLoginSecure();
        if (result.success && result.data) {
            return result.data as unknown as EmployeeProfile[];
        }
        return [];
    } catch (error) {
        console.error('Error fetching login users:', error);
        return [];
    }
}
