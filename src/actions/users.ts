'use server';

import { query } from '../lib/db';
import { EmployeeProfile } from '../domain/types';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';

// --- Types ---
// Mapeo de la DB a nuestro tipo de dominio
function mapUserFromDB(row: any): EmployeeProfile {
    return {
        id: row.id,
        rut: row.rut,
        name: row.name,
        role: row.role,
        access_pin: row.access_pin || '', // Asegurar string
        status: row.status,
        job_title: row.job_title,
        // Campos opcionales
        contact_phone: row.phone,
        // Biometría
        biometric_credentials: typeof row.biometric_credentials === 'string'
            ? JSON.parse(row.biometric_credentials)
            : (row.biometric_credentials || []),
        // Valores por defecto para campos requeridos por la interfaz pero no siempre en DB
        // Salary Data
        base_salary: Number(row.base_salary) || 0,
        pension_fund: row.afp,
        health_system: row.health_system,
        weekly_hours: Number(row.weekly_hours) || 45,

        current_status: 'OUT', // Estado de asistencia por defecto
        assigned_location_id: row.assigned_location_id,
    };
}

export async function getUsers(): Promise<{ success: boolean; data?: EmployeeProfile[]; error?: string }> {
    try {
        const result = await query('SELECT * FROM users ORDER BY name ASC');
        const users = result.rows.map(mapUserFromDB);
        return { success: true, data: users };
    } catch (error: any) {
        console.error('❌ Error fetching users:', error);
        // Devolver el mensaje de error real para depuración
        return { success: false, error: error.message || 'Error desconocido al crear usuario' };
    }
}

export async function createUser(data: Partial<EmployeeProfile>): Promise<{ success: boolean; data?: EmployeeProfile; error?: string }> {
    try {
        // Validación básica
        if (!data.rut || !data.name || !data.role) {
            return { success: false, error: 'Faltan datos obligatorios (RUT, Nombre, Rol)' };
        }

        const sql = `
            INSERT INTO users (id, rut, name, role, access_pin, job_title, status, phone, biometric_credentials, base_salary, afp, health_system, weekly_hours, assigned_location_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *
        `;

        const params = [
            randomUUID(),
            data.rut,
            data.name,
            data.role,
            data.access_pin || null,
            data.job_title || 'CAJERO_VENDEDOR',
            data.status || 'ACTIVE',
            data.contact_phone || null,
            JSON.stringify(data.biometric_credentials || []),
            // HR Data
            data.base_salary || 0,
            data.pension_fund || null,
            data.health_system || null,
            data.weekly_hours || 45,
            data.assigned_location_id || null
        ];

        const result = await query(sql, params);
        const newUser = mapUserFromDB(result.rows[0]);

        revalidatePath('/hr'); // Revalidar caché de la página de RRHH
        return { success: true, data: newUser };
    } catch (error: any) {
        console.error('❌ Error creating user:', error);
        if (error.code === '23505') { // Unique violation
            return { success: false, error: 'El RUT ya está registrado' };
        }
        return { success: false, error: error.message || 'Error al crear usuario' };
    }
}

export async function updateUser(id: string, data: Partial<EmployeeProfile>): Promise<{ success: boolean; data?: EmployeeProfile; error?: string }> {
    console.log('🔄 updateUser called for ID:', id);
    console.log('📦 Data received:', JSON.stringify(data, null, 2));

    try {
        const sql = `
            UPDATE users 
            SET name = $1, role = $2, access_pin = $3, job_title = $4, status = $5, phone = $6, biometric_credentials = $7, 
                base_salary = $8, 
                afp = $9, 
                health_system = $10, 
                weekly_hours = $11,
                assigned_location_id = $12,
                updated_at = NOW()
            WHERE id = $13
            RETURNING *
        `;

        const params = [
            data.name,
            data.role,
            data.access_pin || null,
            data.job_title,
            data.status,
            data.contact_phone || null,
            JSON.stringify(data.biometric_credentials || []),
            // HR Data Updates
            data.base_salary,
            data.pension_fund,
            data.health_system,
            data.weekly_hours,
            data.assigned_location_id, // $12
            id // $13
        ];

        const result = await query(sql, params);

        if (result.rowCount === 0) {
            return { success: false, error: 'Usuario no encontrado' };
        }

        const updatedUser = mapUserFromDB(result.rows[0]);
        revalidatePath('/hr');
        return { success: true, data: updatedUser };
    } catch (error: any) {
        console.error('❌ Error updating user:', error);
        return { success: false, error: error.message || 'Error al actualizar usuario' };
    }
}

export async function deleteUser(id: string): Promise<{ success: boolean; error?: string }> {
    try {
        // Soft delete (cambiar estado a TERMINATED) o Hard delete según preferencia.
        // Aquí usaremos Soft Delete para mantener historial.
        await query("UPDATE users SET status = 'TERMINATED', updated_at = NOW() WHERE id = $1", [id]);
        revalidatePath('/hr');
        return { success: true };
    } catch (error: any) {
        console.error('Error deleting user:', error);
        return { success: false, error: 'Error al eliminar usuario' };
    }
}
