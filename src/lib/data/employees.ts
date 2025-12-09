import { query } from '../db';
import { EmployeeProfile, Role } from '../../domain/types';

// Intentionally returning any[] to match the implicit Employee interface used in components
export async function getEmployees(): Promise<any[]> {
    try {
        const result = await query(`
            SELECT 
                id, rut, name, role, access_pin, status, 
                assigned_location_id, job_title, base_salary,
                afp as pension_fund, health_system
            FROM users
            ORDER BY name ASC
        `);

        return result.rows.map((row: any) => ({
            id: row.id,
            name: row.name,
            role: row.role, // keeping as string
            baseSalary: row.base_salary || 0,
            isActive: row.status === 'ACTIVE',
            photoUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(row.name)}&background=random`,
            pension_fund: row.pension_fund,
            health_system: row.health_system
        }));
    } catch (error) {
        console.error('Failed to fetch employees:', error);
        return [];
    }
}
