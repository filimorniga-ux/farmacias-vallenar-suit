'use server';

import { pool } from '@/lib/db';
import { cookies } from 'next/headers';
// We can use bcryptjs if installed, otherwise fallback/mock or check package.json.
// Assuming basic compare for now to unblock, or try dynamic import.
// Using revalidatePath to refresh cookies if needed? No, standard server action.

export async function getSessionSecure() {
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;
    const role = cookieStore.get('user_role')?.value;
    const locationId = cookieStore.get('user_location')?.value;
    const userName = cookieStore.get('user_name')?.value;

    if (!userId || !role) {
        return null;
    }

    return { userId, role, locationId, userName: userName || 'Usuario' };
}

export async function verifyUserPin(userId: string, pin: string) {
    try {
        if (!userId || !pin) return { success: false, error: 'Datos incompletos' };

        const client = await pool.connect();
        try {
            // 1. Get User
            const res = await client.query('SELECT role, access_pin FROM users WHERE id = $1', [userId]);

            if ((res.rowCount ?? 0) === 0) {
                return { success: false, error: 'Usuario no encontrado' };
            }

            const userData = res.rows[0];

            // 2. Check Role
            const allowedRoles = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'];
            if (!allowedRoles.includes(userData.role)) {
                return { success: false, error: 'Sin permisos suficientes' };
            }

            // 3. Verify PIN
            if (userData.access_pin === pin) {
                return { success: true };
            } else {
                return { success: false, error: 'PIN Incorrecto' };
            }
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error verifying PIN:', error);
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        return { success: false, error: errorMessage };
    }
}

/**
 * Validates supervisor PIN for overrides (POS, Inventory, etc)
 */
export async function validateSupervisorPin(pin: string, requiredRoles: string[] = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL']) {
    try {
        const client = await pool.connect();
        try {
            // Find ANY user with one of the required roles AND matching PIN
            const res = await client.query(`
                SELECT id, name, role, access_pin 
                FROM users 
                WHERE role = ANY($1::text[]) 
                AND access_pin = $2
                AND is_active = true
                LIMIT 1
            `, [requiredRoles, pin]);

            if ((res.rowCount ?? 0) > 0) {
                const user = res.rows[0];
                return {
                    success: true,
                    authorizedBy: { id: user.id, name: user.name, role: user.role }
                };
            }
            return { success: false, error: 'PIN inválido o sin permisos' };
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Validate Supervisor PIN Error:', error);
        return { success: false, error: 'Error de servidor' };
    }
}

/**
 * Main secure authentication for login
 */
export async function authenticateUserSecure(userId: string, pin: string, locationId?: string) {
    try {
        if (!userId || !pin) return { success: false, error: 'Credenciales incompletas' };

        const client = await pool.connect();
        try {
            const res = await client.query(`
                SELECT id, name, role, access_pin, assigned_location_id, is_active 
                FROM users 
                WHERE id = $1
            `, [userId]);

            if ((res.rowCount ?? 0) === 0) return { success: false, error: 'Usuario no encontrado' };

            const user = res.rows[0];

            if (!user.is_active) return { success: false, error: 'Usuario inactivo' };

            // PIN Check (Plaintext for now as per migration state)
            if (user.access_pin !== pin) {
                return { success: false, error: 'PIN incorrecto' };
            }

            // --- Success ---
            // Set Cookies
            const cookieStore = await cookies();

            // Set session cookies (HTTPOnly)
            cookieStore.set('user_id', user.id, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
            cookieStore.set('user_role', user.role, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
            cookieStore.set('user_name', user.name, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });

            // Set Location Cookie (if user has one or if provided)
            const targetLocationId = locationId || user.assigned_location_id;
            if (targetLocationId) {
                cookieStore.set('user_location', targetLocationId, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
            }

            return {
                success: true,
                user: {
                    id: user.id,
                    name: user.name,
                    role: user.role,
                    assigned_location_id: user.assigned_location_id
                }
            };

        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Auth Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        return { success: false, error: errorMessage };
    }
}
