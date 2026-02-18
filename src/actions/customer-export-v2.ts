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
import { logger } from '@/lib/logger';
import { ExcelService } from '@/lib/excel-generator';
import { formatDateTimeCL, formatDateCL, formatTimeCL } from '@/lib/timezone';
import { getSessionSecure } from './auth-v2';

// ============================================================================
// CONSTANTS
// ============================================================================

const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL'];
const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'];

// ============================================================================
// HELPERS
// ============================================================================

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
    } catch { }
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
    const session = await getSessionSecure();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!MANAGER_ROLES.includes(session.role)) return { success: false, error: 'Acceso denegado' };

    try {
        const { startDate, endDate, customerIds } = params;

        let customersRes;
        if (customerIds?.length) {
            customersRes = await query('SELECT * FROM customers WHERE id = ANY($1) ORDER BY name ASC', [customerIds]);
        } else {
            customersRes = await query('SELECT * FROM customers WHERE status != \'DELETED\' ORDER BY name ASC LIMIT 5000');
        }

        const salesRes = await query(`
            SELECT customer_rut, SUM(total_amount) as total, COUNT(*) as count, MAX(timestamp) as last_purchase
            FROM sales 
            WHERE timestamp >= $1::timestamp AND timestamp <= $2::timestamp
              AND customer_rut IS NOT NULL AND customer_rut != ''
            GROUP BY customer_rut
        `, [startDate, endDate]);

        const salesMap = new Map((salesRes.rows).map((r: any) => [r.customer_rut, r]));

        const data = (customersRes.rows).map((cust: any) => {
            const stats = salesMap.get(cust.rut) || { total: 0, count: 0, last_purchase: null };
            return {
                rut: maskRut(cust.rut),
                name: cust.name || '-',
                phone: cust.phone || '-',
                email: cust.email || '-',
                points: Number(cust.loyalty_points || 0),
                p_count: Number(stats.count),
                p_total: Number(stats.total),
                last: stats.last_purchase ? formatDateCL(new Date(stats.last_purchase)) : 'Sin compras'
            };
        });

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Maestro de Clientes - Farmacias Vallenar',
            subtitle: `Período de Actividad: ${formatDateCL(new Date(startDate))} al ${formatDateCL(new Date(endDate))}`,
            sheetName: 'Clientes Vallenar',
            creator: session.userName,
            columns: [
                { header: 'RUT (Protegido)', key: 'rut', width: 15 },
                { header: 'Nombre Completo', key: 'name', width: 35 },
                { header: 'Teléfono', key: 'phone', width: 15 },
                { header: 'Email de Contacto', key: 'email', width: 25 },
                { header: 'Puntos Acum.', key: 'points', width: 15 },
                { header: 'Transacciones', key: 'p_count', width: 15 },
                { header: 'Monto Total ($)', key: 'p_total', width: 18 },
                { header: 'Última Compra', key: 'last', width: 18 },
            ],
            data,
        });

        await auditExport(session.userId, 'CUSTOMER_REPORT', { ...params, rows: data.length });
        return { success: true, data: buffer.toString('base64'), filename: `MaestroClientes_${startDate.split('T')[0]}.xlsx` };

    } catch (error: any) {
        logger.error({ error }, '[Export] Customer report error');
        return { success: false, error: 'Error exportando clientes' };
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
    const session = await getSessionSecure();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!MANAGER_ROLES.includes(session.role)) return { success: false, error: 'Acceso denegado' };

    try {
        const res = await query(`
            SELECT id, name, rut, email, loyalty_points, 
                   (SELECT COALESCE(SUM(points_redeemed), 0) FROM loyalty_redemptions WHERE customer_id = customers.id) as redeemed
            FROM customers
            WHERE loyalty_points > 0
            ORDER BY loyalty_points DESC
            LIMIT 2000
        `);

        const data = res.rows.map((row: any) => ({
            rut: maskRut(row.rut),
            name: row.name,
            email: row.email || '-',
            points: Number(row.loyalty_points),
            redeemed: Number(row.redeemed),
            available: Number(row.loyalty_points) - Number(row.redeemed),
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Ranking de Fidelización y Puntos - Farmacias Vallenar',
            subtitle: `Corte al: ${formatDateTimeCL(new Date())}`,
            sheetName: 'Ranking VIP',
            creator: session.userName,
            columns: [
                { header: 'RUT', key: 'rut', width: 15 },
                { header: 'Nombre Cliente', key: 'name', width: 35 },
                { header: 'Email', key: 'email', width: 25 },
                { header: 'Puntos Históricos', key: 'points', width: 18 },
                { header: 'Puntos Canjeados', key: 'redeemed', width: 18 },
                { header: 'Saldo Disponible', key: 'available', width: 18 },
            ],
            data,
        });

        await auditExport(session.userId, 'LOYALTY_REPORT', { count: data.length });
        return { success: true, data: buffer.toString('base64'), filename: `ProgramaPuntos_${new Date().toISOString().split('T')[0]}.xlsx` };

    } catch (error: any) {
        logger.error({ error }, '[Export] Loyalty report error');
        return { success: false, error: 'Error exportando fidelización' };
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
    const session = await getSessionSecure();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!MANAGER_ROLES.includes(session.role)) return { success: false, error: 'Acceso denegado' };

    try {
        const { customerIds, startDate, endDate } = params;

        const customersRes = await query(`
            SELECT id, rut, name FROM customers WHERE id = ANY($1)
        `, [customerIds]);

        if (customersRes.rowCount === 0) return { success: false, error: 'Clientes no encontrados' };

        const customerRuts = customersRes.rows.map((c: any) => c.rut);

        let dateFilter = '';
        const queryParams: any[] = [customerRuts];
        if (startDate) { dateFilter += ` AND s.timestamp >= $2::timestamp`; queryParams.push(startDate); }
        if (endDate) { dateFilter += ` AND s.timestamp <= $${queryParams.length + 1}::timestamp`; queryParams.push(endDate); }

        const salesRes = await query(`
            SELECT 
                s.id as sale_id, s.timestamp, s.total_amount, s.status, s.payment_method, s.customer_rut, s.dte_folio,
                si.product_name, si.quantity, si.unit_price, si.total_price
            FROM sales s
            LEFT JOIN sale_items si ON s.id = si.sale_id
            WHERE s.customer_rut = ANY($1) ${dateFilter}
            ORDER BY s.timestamp DESC
        `, queryParams);

        const flattenedData = salesRes.rows.map((row: any) => {
            const customer = customersRes.rows.find((c: any) => c.rut === row.customer_rut);
            return {
                date: formatDateTimeCL(row.timestamp),
                customer: customer ? customer.name : row.customer_rut,
                rut: maskRut(row.customer_rut),
                folio: row.dte_folio || 'S/N',
                status: row.status,
                product: row.product_name,
                qty: Number(row.quantity),
                price: Number(row.unit_price),
                total: Number(row.total_price),
                method: row.payment_method
            };
        });

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Historial Transaccional de Clientes - Farmacias Vallenar',
            subtitle: `Reporte de Consumo Detallado - Generado: ${formatDateCL(new Date())}`,
            sheetName: 'Historial',
            creator: session.userName,
            columns: [
                { header: 'Fecha y Hora', key: 'date', width: 22 },
                { header: 'Nombre Cliente', key: 'customer', width: 30 },
                { header: 'RUT', key: 'rut', width: 15 },
                { header: 'Folio DTE', key: 'folio', width: 15 },
                { header: 'Acción', key: 'status', width: 12 },
                { header: 'Producto/Servicio', key: 'product', width: 35 },
                { header: 'Cant', key: 'qty', width: 10 },
                { header: 'P.Unit ($)', key: 'price', width: 12 },
                { header: 'SubTotal ($)', key: 'total', width: 15 },
                { header: 'Medio Pago', key: 'method', width: 15 },
            ],
            data: flattenedData,
        });

        await auditExport(session.userId, 'CUSTOMER_HISTORY', { ...params, rows: flattenedData.length });
        return { success: true, data: buffer.toString('base64'), filename: `HistorialClientes_${formatDateCL(new Date()).replace(/\//g, '-')}.xlsx` };

    } catch (error: any) {
        logger.error({ error }, '[Export] History report error');
        return { success: false, error: 'Error generando historial' };
    }
}

