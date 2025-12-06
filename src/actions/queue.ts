'use server';

import { query } from '../lib/db';

export async function generateTicket(data: { rut?: string, serviceType: string, locationId: string }) {
    try {
        const { rut, serviceType, locationId } = data;
        console.log(`🎫 Generando ticket: ${serviceType} (RUT: ${rut || 'Anon'}) @ ${locationId}`);

        // 1. CRM Feed (if RUT provided)
        if (rut) {
            // Check if customer exists
            const customerCheck = await query('SELECT id FROM customers WHERE rut = $1', [rut]);

            if (customerCheck.rowCount === 0) {
                console.log(`🆕 Creando cliente desde Totem: ${rut}`);
                // Create Prospect
                await query(
                    `INSERT INTO customers (id, rut, "fullName", tags, "totalPoints") 
                     VALUES (gen_random_uuid(), $1, $2, $3, 0)`,
                    [rut, 'Prospecto Totem', ['TOTEM_LEAD']]
                );
            } else {
                console.log(`✅ Cliente existente detectado en Totem: ${rut}`);
            }
        }

        // 2. Generate Ticket Number
        // Logic: Get count for today/location ?? Or just random/incremental?
        // Simple Logic: Get last ticket number or Count + 1.
        // Or "L-001" format based on service type? (e.g. F-101 for Farmacia)

        // Let's use simple daily sequence per location
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const countRes = await query(
            `SELECT COUNT(*) as count FROM queue_tickets 
             WHERE location_id = $1 AND created_at >= $2`,
            [locationId, todayStart]
        );

        const count = parseInt(countRes.rows[0].count) || 0;
        const ticketNumber = `${serviceType.charAt(0).toUpperCase()}-${(count + 1).toString().padStart(3, '0')}`;

        // 3. Insert Ticket
        const result = await query(
            `INSERT INTO queue_tickets (location_id, ticket_number, customer_rut, service_type, status)
             VALUES ($1, $2, $3, $4, 'WAITING')
             RETURNING *`,
            [locationId, ticketNumber, rut || null, serviceType]
        );

        return { success: true, ticket: result.rows[0] };

    } catch (error: any) {
        console.error('❌ Error generating ticket:', error);
        return { success: false, error: error.message };
    }
}

export async function getQueueStatus(locationId: string) {
    try {
        const result = await query(
            `SELECT * FROM queue_tickets 
             WHERE location_id = $1 AND status IN ('WAITING', 'SERVING')
             ORDER BY created_at ASC`,
            [locationId]
        );
        return { success: true, output: result.rows };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
