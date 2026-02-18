'use server';

/**
 * ============================================================================
 * CUSTOMER-EXPORT-V2: Exportación de Clientes Segura
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES:
 * - RBAC: Solo MANAGER+ puede exportar
 * - Enmascarar RUT parcialmente
 * - Auditoría de exportaciones
 */

import { query } from '@/lib/db';
import { z } from 'zod';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { ExcelService } from '@/lib/excel-generator';

// ============================================================================
// CONSTANTS
// ============================================================================

const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL'];
const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'];

// ============================================================================
// HELPERS
// ============================================================================

async function getSession(): Promise<{ userId: string; role: string; userName?: string } | null> {
    try {
        const { cookies } = await import('next/headers');
        const cookieStore = await cookies();
        const sessionToken = cookieStore.get('session_token')?.value;

        // 1. Try Secure Session Token (Best Practice)
        if (sessionToken) {
            const res = await query(
                `SELECT u.id as "userId", u.role, u.name as "userName"
                 FROM sessions s
                 JOIN users u ON s.user_id = u.id
                 WHERE s.token = $1 AND s.expires_at > NOW()`,
                [sessionToken]
            );

            if ((res.rowCount || 0) > 0) {
                const row = res.rows[0];
                return {
                    userId: row.userId,
                    role: row.role,
                    userName: row.userName || undefined
                };
            }
        }

        // 2. Fallback: Auth-V2 Cookies (user_id + user_role)
        const userId = cookieStore.get('user_id')?.value;
        if (userId) {
            const res = await query(
                `SELECT id, role, name 
                 FROM users 
                 WHERE id = $1 AND is_active = true`,
                [userId]
            );

            if ((res.rowCount || 0) > 0) {
                const user = res.rows[0];
                return {
                    userId: user.id,
                    role: user.role,
                    userName: user.name || undefined
                };
            }
        }

        return null; // No valid session found
    } catch (error: unknown) {
        console.error('[Customer Export] getSession error:', error instanceof Error ? error.message : error);
        return null;
    }
}

function maskRut(rut: string): string {
    if (!rut || rut.length < 4) return rut;
    // Mostrar solo últimos 4 caracteres: ****-1234-5
    return '****' + rut.slice(-5);
}

async function auditExport(userId: string, exportType: string, params: Record<string, unknown>): Promise<void> {
    try {
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'EXPORT', 'CUSTOMER', $2::jsonb, NOW())
        `, [userId, JSON.stringify({ export_type: exportType, ...params })]);
    } catch (error) {
        console.warn('[Customer Export] auditExport failed:', error instanceof Error ? error.message : 'Unknown error');
    }
}

// ============================================================================
// GENERATE CUSTOMER REPORT
// ============================================================================

/**
 * 👥 Generar Reporte de Clientes (MANAGER+)
 */
export async function generateCustomerReportSecure(
    params: { startDate: string; endDate: string; customerIds?: string[] }
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo managers pueden exportar datos de clientes' };
    }

    try {
        const { startDate, endDate, customerIds } = params;

        // Obtener clientes (usando nombres de columnas correctos de la DB)
        let customersRes;
        if (customerIds && customerIds.length > 0) {
            customersRes = await query('SELECT * FROM customers WHERE id = ANY($1) ORDER BY name ASC', [customerIds]);
        } else {
            customersRes = await query('SELECT * FROM customers WHERE status != \'DELETED\' ORDER BY name ASC LIMIT 5000');
        }

        // Obtener ventas del período (usando customer_rut ya que no hay customer_id)
        const salesRes = await query(`
            SELECT customer_rut, SUM(total_amount) as total, COUNT(*) as count, MAX(timestamp) as last_purchase
            FROM sales 
            WHERE timestamp >= $1::timestamp AND timestamp <= $2::timestamp
              AND customer_rut IS NOT NULL AND customer_rut != ''
            GROUP BY customer_rut
        `, [startDate, endDate]);

        const salesMap = new Map((salesRes.rows as Record<string, unknown>[]).map((r) => [r.customer_rut as string, r]));

        const data = (customersRes.rows as Record<string, unknown>[]).map((cust) => {
            const stats = (salesMap.get(cust.rut as string) as Record<string, unknown>) || { total: 0, count: 0 }; // Match by RUT
            return {
                rut: maskRut(cust.rut as string), // ENMASCARADO
                name: cust.name || cust.fullName || '-', // Use 'name' from DB
                phone: cust.phone || '-',
                email: cust.email || '-',
                totalPoints: cust.loyalty_points || cust.totalPoints || 0, // Use 'loyalty_points' from DB
                purchaseCount: Number(stats.count || 0),
                totalAmount: Number(stats.total || 0),
            };
        });

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Reporte de Clientes',
            subtitle: `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`,
            sheetName: 'Clientes',
            creator: session.userName,
            columns: [
                { header: 'RUT (Parcial)', key: 'rut', width: 12 },
                { header: 'Nombre', key: 'name', width: 30 },
                { header: 'Teléfono', key: 'phone', width: 15 },
                { header: 'Email', key: 'email', width: 25 },
                { header: 'Puntos', key: 'totalPoints', width: 10 },
                { header: 'Compras', key: 'purchaseCount', width: 10 },
                { header: 'Total ($)', key: 'totalAmount', width: 15 },
            ],
            data,
        });

        await auditExport(session.userId, 'CUSTOMER_REPORT', { startDate, endDate, customers: data.length });

        logger.info({ userId: session.userId, customers: data.length }, '👥 [Export] Customer report');
        return {
            success: true,
            data: buffer.toString('base64'),
            filename: `Clientes_${startDate.split('T')[0]}.xlsx`,
        };

    } catch (error: unknown) {
        console.error('[Export] Customer report error:', error);
        logger.error({ error }, '[Export] Customer report error');
        return { success: false, error: 'Error generando reporte: ' + (error instanceof Error ? error.message : 'Error desconocido') };
    }
}

// ============================================================================
// EXPORT LOYALTY REPORT
// ============================================================================

/**
 * 🏆 Reporte de Programa de Puntos (MANAGER+)
 */
export async function exportLoyaltyReportSecure(): Promise<{
    success: boolean;
    data?: string;
    filename?: string;
    error?: string;
}> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Acceso denegado' };
    }

    try {
        const res = await query(`
            SELECT id, "fullName", rut, email, "totalPoints", "totalRedeemed"
            FROM customers
            WHERE "totalPoints" > 0 OR "totalRedeemed" > 0
            ORDER BY "totalPoints" DESC
            LIMIT 1000
        `);

        const data = (res.rows as Record<string, unknown>[]).map((row) => ({
            rut: maskRut(row.rut as string),
            name: row.fullName as string,
            email: (row.email as string) || '-',
            points: (row.totalPoints as number) || 0,
            redeemed: (row.totalRedeemed as number) || 0,
            available: ((row.totalPoints as number) || 0) - ((row.totalRedeemed as number) || 0),
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Reporte Programa de Fidelización',
            subtitle: `Generado: ${new Date().toLocaleDateString('es-CL')}`,
            sheetName: 'Fidelización',
            creator: session.userName,
            columns: [
                { header: 'RUT', key: 'rut', width: 12 },
                { header: 'Nombre', key: 'name', width: 30 },
                { header: 'Email', key: 'email', width: 25 },
                { header: 'Puntos Totales', key: 'points', width: 12 },
                { header: 'Canjeados', key: 'redeemed', width: 12 },
                { header: 'Disponibles', key: 'available', width: 12 },
            ],
            data,
        });

        await auditExport(session.userId, 'LOYALTY_REPORT', { count: data.length });

        return {
            success: true,
            data: buffer.toString('base64'),
            filename: `Fidelizacion_${new Date().toISOString().split('T')[0]}.xlsx`,
        };

    } catch (error: unknown) {
        logger.error({ error }, '[Export] Loyalty report error');
        return { success: false, error: 'Error generando reporte: ' + (error instanceof Error ? error.message : 'Error desconocido') };
    }
}

// ============================================================================
// EXPORT CUSTOMER HISTORY REPORT
// ============================================================================

/**
 * 📜 Reporte Detallado de Historial de Compras (MANAGER+)
 */
export async function generateCustomerHistoryReportSecure(
    params: { customerIds: string[]; startDate?: string; endDate?: string }
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Acceso denegado' };
    }

    try {
        const { customerIds, startDate, endDate } = params;

        // 1. Get Customers
        const customersRes = await query(`
            SELECT id, rut, name, phone, email, loyalty_points as "totalPoints" 
            FROM customers 
            WHERE id = ANY($1)
        `, [customerIds]);

        if (customersRes.rowCount === 0) {
            return { success: false, error: 'Clientes no encontrados' };
        }

        const customers = customersRes.rows;
        const customerRuts = customers.map(c => c.rut);

        // 2. Build Date Filter
        let dateFilter = '';
        const queryParams: (string | string[])[] = [customerRuts];
        let paramIndex = 2;

        if (startDate) {
            dateFilter += ` AND s.timestamp >= $${paramIndex++}::timestamp`;
            queryParams.push(startDate);
        }
        if (endDate) {
            dateFilter += ` AND s.timestamp <= $${paramIndex++}::timestamp`;
            queryParams.push(endDate);
        }

        // 3. Get Sales with Items (Joined)
        // Note: Using subquery or join to get items
        const salesRes = await query(`
            SELECT 
                s.id as sale_id,
                s.timestamp,
                s.total_amount,
                s.status,
                s.payment_method,
                s.customer_rut,
                si.product_name,
                si.quantity,
                si.unit_price,
                si.total_price,
                si.batch_id
            FROM sales s
            LEFT JOIN sale_items si ON s.id = si.sale_id
            WHERE s.customer_rut = ANY($1)
            ${dateFilter}
            ORDER BY s.timestamp DESC
        `, queryParams as (string | string[] | null)[]);

        // 4. Generate Excel
        const excel = new ExcelService();
        // We'll use a custom generation here since ExcelService might be limited to single sheet or specific format
        // But assuming ExcelService can handle basic data generation, we might need to extend it or use it creatively.
        // For now, let's assume we want a single flattened sheet for simplicity and compatibility with standard ExcelService
        // OR we can try to use raw exceljs if we had access, but we are inside an action.
        // Let's stick to ExcelService's generateReport pattern but flatten the data for a detailed view.

        const flattenedData = (salesRes.rows as Record<string, unknown>[]).map((row) => {
            const customer = customers.find(c => c.rut === row.customer_rut);
            return {
                date: new Date(row.timestamp as string).toLocaleDateString() + ' ' + new Date(row.timestamp as string).toLocaleTimeString(),
                customer: customer ? customer.name : row.customer_rut,
                rut: maskRut(row.customer_rut as string),
                saleId: (row.sale_id as string).slice(0, 8),
                status: row.status,
                product: row.product_name,
                qty: row.quantity,
                price: row.unit_price,
                total: row.total_price,
                payment: row.payment_method
            };
        });

        const buffer = await excel.generateReport({
            title: 'Historial Detallado de Compras',
            subtitle: `Generado: ${new Date().toLocaleDateString()}`,
            sheetName: 'Detalle Ventas',
            creator: session.userName,
            columns: [
                { header: 'Fecha', key: 'date', width: 20 },
                { header: 'Cliente', key: 'customer', width: 25 },
                { header: 'RUT', key: 'rut', width: 12 },
                { header: 'ID Venta', key: 'saleId', width: 10 },
                { header: 'Estado', key: 'status', width: 10 },
                { header: 'Producto', key: 'product', width: 30 },
                { header: 'Cant', key: 'qty', width: 8 },
                { header: 'P.Unit', key: 'price', width: 10 },
                { header: 'Total', key: 'total', width: 10 },
                { header: 'Pago', key: 'payment', width: 10 },
            ],
            data: flattenedData,
        });

        await auditExport(session.userId, 'CUSTOMER_HISTORY', {
            customers: customerIds?.length || 'ALL',
            rows: flattenedData.length
        });

        return {
            success: true,
            data: buffer.toString('base64'),
            filename: `Historial_Compras_${new Date().toISOString().split('T')[0]}.xlsx`,
        };

    } catch (error: unknown) {
        logger.error({ error }, '[Export] History report error');
        return { success: false, error: 'Error generando historial: ' + (error instanceof Error ? error.message : 'Error desconocido') };
    }
}
