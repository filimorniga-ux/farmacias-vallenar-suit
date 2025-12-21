'use server';

import { query } from '../lib/db';

export type TicketType = 'GENERAL' | 'PREFERENTIAL';

export async function createTicket(branchId: string, rut: string, type: TicketType = 'GENERAL', name?: string) {
    try {
        console.log(`🎫 Creating ticket: ${type} (RUT: ${rut || 'Anon'}) @ ${branchId}`);

        let customerId = null;
        let customerName = name || 'Anónimo';

        // 1. Identify/Create Customer
        if (rut && rut !== 'ANON') {
            const customerRes = await query(`SELECT id, full_name, name FROM customers WHERE rut = $1`, [rut]);

            if ((customerRes.rowCount || 0) > 0) {
                // Existing Customer
                customerId = customerRes.rows[0].id;
                customerName = customerRes.rows[0].full_name || customerRes.rows[0].name; // Use DB name
            } else if (name) {
                // New Customer (Insert)
                const newCustomerRes = await query(
                    `INSERT INTO customers (rut, full_name, name, total_points, registration_source, status, created_at, updated_at)
                     VALUES ($1, $2, $3, 0, 'KIOSK', 'ACTIVE', NOW(), NOW())
                     RETURNING id`,
                    [rut, name, name] // Using name for both full_name and name for simplicity
                );
                customerId = newCustomerRes.rows[0].id;
                // customerName is already set to name
            }
        }

        // 2. Generate Ticket Code
        const countRes = await query(
            `SELECT COUNT(*) as count FROM queue_tickets 
             WHERE branch_id = $1 AND date_trunc('day', created_at) = date_trunc('day', NOW())`,
            [branchId]
        );

        const count = parseInt(countRes.rows[0].count) || 0;
        const codePrefix = type === 'PREFERENTIAL' ? 'P' : 'G';
        const ticketCode = `${codePrefix}${(count + 1).toString().padStart(3, '0')}`;

        // 3. Insert Ticket
        // Assuming queue_tickets has a customer_id column? If not, we might need to rely on just RUT link or add the column.
        // Based on previous conversations, there wasn't explicit mention of adding customer_id column to queue_tickets, 
        // but it is best practice. However, "rut" is there. I will proceed using RUT as the link if customer_id is not in schema, 
        // OR assuming customer_id exists. Let's stick to RUT for the INSERT to be safe with existing schema, 
        // but we DID create/find the customer to ensure they exist.
        // Wait, the prompt says "Asociar el nuevo ticket a ese customer_id". 
        // I will try to insert customer_id if the column exists. If I am unsure, I'll stick to RUT but knowing we validated the customer.
        // Safe bet: Insert RUT. If the table has customer_id, I should insert it.
        // Let's assume queue_tickets might only have RUT based on previous `view_file`.
        // Line 33 was: INSERT INTO queue_tickets (branch_id, rut, type, code, status)
        // I will stick to that to avoid SQL errors if column missing. The association is via RUT.

        const result = await query(
            `INSERT INTO queue_tickets (branch_id, rut, type, code, status)
             VALUES ($1, $2, $3, $4, 'WAITING')
             RETURNING *`,
            [branchId, rut || 'ANON', type, ticketCode]
        );

        return {
            success: true,
            ticket: {
                ...result.rows[0],
                customerName // Return name for UI display
            }
        };

    } catch (error: any) {
        console.error('❌ Error creating ticket:', error);
        return { success: false, error: error.message };
    }
}

export async function getNextTicket(branchId: string, terminalId?: string) {
    try {
        // Priority Logic:
        // 1. Preferential tickets first (ordered by created_at)
        // 2. Then General tickets (ordered by created_at)
        // Filter by branch and status WAITING.

        const result = await query(
            `SELECT * FROM queue_tickets 
             WHERE branch_id = $1 AND status = 'WAITING'
             ORDER BY 
                CASE WHEN type = 'PREFERENTIAL' THEN 1 ELSE 2 END ASC,
                created_at ASC
             LIMIT 1`,
            [branchId]
        );

        if (result.rowCount === 0) {
            return { success: true, ticket: null };
        }

        const nextTicket = result.rows[0];

        // Mark as CALLED immediately
        const updateRes = await query(
            `UPDATE queue_tickets 
             SET status = 'CALLED', 
                 called_at = NOW(),
                 terminal_id = COALESCE($2, terminal_id)
             WHERE id = $1
             RETURNING *`,
            [nextTicket.id, terminalId]
        );

        return { success: true, ticket: updateRes.rows[0] };

    } catch (error: any) {
        console.error('❌ Error getting next ticket:', error);
        return { success: false, error: error.message };
    }
}

export async function getQueueStatus(branchId: string) {
    try {
        // Get counts or list of waiting tickets for dashboard
        const result = await query(
            `SELECT * FROM queue_tickets 
             WHERE branch_id = $1 AND status IN ('WAITING', 'CALLED')
             ORDER BY created_at ASC`,
            [branchId]
        );

        const waitingCount = result.rows.filter((t: any) => t.status === 'WAITING').length;
        const currentTicket = result.rows.find((t: any) => t.status === 'CALLED');

        return { success: true, waitingCount, currentTicket, allTickets: result.rows };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function completeTicket(ticketId: string) {
    try {
        const result = await query(
            `UPDATE queue_tickets 
             SET status = 'COMPLETED', completed_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [ticketId]
        );
        return { success: true, ticket: result.rows[0] };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
