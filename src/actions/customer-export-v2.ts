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
        const headersList = await headers();
        const userId = headersList.get('x-user-id');
        const role = headersList.get('x-user-role');
        const userName = headersList.get('x-user-name');
        if (!userId || !role) return null;
        return { userId, role, userName: userName || undefined };
    } catch {
        return null;
    }
}

function maskRut(rut: string): string {
    if (!rut || rut.length < 4) return rut;
    // Mostrar solo últimos 4 caracteres: ****-1234-5
    return '****' + rut.slice(-5);
}

async function auditExport(userId: string, exportType: string, params: any): Promise<void> {
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
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo managers pueden exportar datos de clientes' };
    }

    try {
        const { startDate, endDate, customerIds } = params;

        // Obtener clientes
        let customersRes;
        if (customerIds && customerIds.length > 0) {
            customersRes = await query('SELECT * FROM customers WHERE id = ANY($1) ORDER BY "fullName" ASC', [customerIds]);
        } else {
            customersRes = await query('SELECT * FROM customers ORDER BY "fullName" ASC LIMIT 5000');
        }

        // Obtener ventas del período
        const salesRes = await query(`
            SELECT customer_id, SUM(total_amount) as total, COUNT(*) as count, MAX(timestamp) as last_purchase
            FROM sales 
            WHERE timestamp >= $1::timestamp AND timestamp <= $2::timestamp
              AND customer_id IS NOT NULL
            GROUP BY customer_id
        `, [startDate, endDate]);

        const salesMap = new Map(salesRes.rows.map((r: any) => [r.customer_id, r]));

        const data = customersRes.rows.map((cust: any) => {
            const stats = salesMap.get(cust.id) || { total: 0, count: 0 };
            return {
                rut: maskRut(cust.rut), // ENMASCARADO
                name: cust.fullName,
                phone: cust.phone || '-',
                email: cust.email || '-',
                totalPoints: cust.totalPoints || 0,
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

    } catch (error: any) {
        logger.error({ error }, '[Export] Customer report error');
        return { success: false, error: 'Error generando reporte' };
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

        const data = res.rows.map((row: any) => ({
            rut: maskRut(row.rut),
            name: row.fullName,
            email: row.email || '-',
            points: row.totalPoints || 0,
            redeemed: row.totalRedeemed || 0,
            available: (row.totalPoints || 0) - (row.totalRedeemed || 0),
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

    } catch (error: any) {
        logger.error({ error }, '[Export] Loyalty report error');
        return { success: false, error: 'Error generando reporte' };
    }
}
