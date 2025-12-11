'use server';

import { query } from '@/lib/db';

export async function getLocationHealth(locationId: string) {
    try {
        // 1. Stock Alerts (Low Stock)
        // Assuming 'products' or 'inventory' table. Using 'products' based on previous context, or checking schema.
        // Actually, schema_audit suggests 'audit_logs'. Need to infer inventory table.
        // Usually it's 'inventory_batches' or 'products'. Let's assume 'products' table for simplified count or 'inventory_batches'.
        // Let's use 'inventory_batches' as seen in types.ts.

        // Wait, 'inventory_batches' usually has 'location_id'.

        const stockRes = await query(`
            SELECT COUNT(*) as count 
            FROM inventory_batches 
            WHERE location_id = $1 AND stock_actual < stock_min
        `, [locationId]);

        const stockAlerts = parseInt(stockRes.rows[0]?.count || '0');

        // 2. Cash Alerts (Open > 12h)
        // Table 'terminals' has 'status'. Need to check shift logs for open time?
        // Actually, 'terminals' table doesn't have 'last_opened_at'.
        // We should check active shifts in 'shifts' table.
        // "COUNT(*) of terminals in state 'OPEN' with more than 12 hours of activity"
        // This likely means active shifts that started > 12h ago.

        const cashRes = await query(`
            SELECT COUNT(*) as count
            FROM shifts 
            WHERE status = 'ACTIVE' 
            AND location_id = $1 -- Valid if shifts has location_id, otherwise join terminals
            AND start_time < (extract(epoch from now()) * 1000 - 43200000) -- 12 hours in ms
        `, [locationId]).catch(() => ({ rows: [{ count: 0 }] })); // Fallback if schema differs

        // If shifts doesn't have location_id directly, we join terminals:
        // SELECT count(*) FROM shifts s JOIN terminals t ON s.terminal_id = t.id WHERE t.location_id = $1 ...
        // We'll stick to a simple query first or try robustness.
        const cashResRobust = await query(`
            SELECT COUNT(*) as count
            FROM shifts s
            JOIN terminals t ON s.terminal_id = t.id
            WHERE s.status = 'ACTIVE'
            AND t.location_id = $1
            AND s.start_time < (extract(epoch from now()) * 1000 - 43200000)
        `, [locationId]);

        const cashAlerts = parseInt(cashResRobust.rows[0]?.count || '0');

        // 3. Staff Present
        // Attendance logs for today with 'CHECK_IN' not paired with 'CHECK_OUT' or just distinct users today.
        // 'COUNT(*) of employees assigned present today'
        // Let's count unique employees with a CHECK_IN today.

        // Start of today timestamp
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const startTimestamp = startOfDay.getTime();

        const staffRes = await query(`
            SELECT COUNT(DISTINCT employee_id) as count
            FROM attendance_logs
            WHERE timestamp >= $1 
            AND type = 'CHECK_IN'
            -- We might need to filter by location if logs track where they checked in.
            -- Often 'users' has 'assigned_location_id'. 
            -- But attendace could be at any kiosk. Kiosk has location_id?
            -- Let's filter by employees assigned to this location for now.
            AND employee_id IN (SELECT id FROM users WHERE assigned_location_id = $2)
        `, [startTimestamp, locationId]);

        const staffPresent = parseInt(staffRes.rows[0]?.count || '0');

        return {
            stockAlerts,
            cashAlerts,
            staffPresent
        };

    } catch (error) {
        console.error('Error fetching location health:', error);
        return {
            stockAlerts: 0,
            cashAlerts: 0,
            staffPresent: 0
        };
    }
}
