'use server';

/**
 * ============================================================================
 * DASHBOARD-V2: Métricas Financieras Seguras
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES:
 * - RBAC por rol (CAJERO: terminal, MANAGER: ubicación, ADMIN: todo)
 * - Queries parametrizados (sin concatenación)
 * - Auditoría de acceso a métricas
 * - Caché de 5 minutos
 */

import { pool, query } from '@/lib/db';
import { z } from 'zod';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';

// ============================================================================
// SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');

const DateRangeSchema = z.object({
    from: z.date(),
    to: z.date(),
});

const MetricsParamsSchema = z.object({
    dateRange: DateRangeSchema,
    locationId: UUIDSchema.optional(),
    terminalId: UUIDSchema.optional(),
});

// ============================================================================
// TYPES
// ============================================================================

export interface FinancialMetrics {
    summary: {
        total_sales: number;
        total_income_other: number;
        total_expenses: number;
        base_cash: number;
        net_cash_flow: number;
        sales_count: number;
    };
    by_payment_method: {
        cash: number;
        debit: number;
        credit: number;
        transfer: number;
        others: number;
    };
    breakdown: { id: string; name: string; total: number }[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL'];
const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'];

// Caché simple en memoria
const metricsCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// ============================================================================
// HELPERS
// ============================================================================

async function getSession(): Promise<{ userId: string; role: string; locationId?: string; terminalId?: string } | null> {
    try {
        const headersList = await headers();
        const userId = headersList.get('x-user-id');
        const role = headersList.get('x-user-role');
        const locationId = headersList.get('x-user-location');
        const terminalId = headersList.get('x-terminal-id');
        if (!userId || !role) return null;
        return { userId, role, locationId: locationId || undefined, terminalId: terminalId || undefined };
    } catch {
        return null;
    }
}

function getCacheKey(params: any, userId: string): string {
    return `metrics:${userId}:${JSON.stringify(params)}`;
}

function getFromCache(key: string): any | null {
    const entry = metricsCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        metricsCache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache(key: string, data: any): void {
    metricsCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ============================================================================
// FINANCIAL METRICS (RBAC)
// ============================================================================

/**
 * 📊 Obtener Métricas Financieras con RBAC
 */
export async function getFinancialMetricsSecure(
    params: z.infer<typeof MetricsParamsSchema>
): Promise<{ success: boolean; data?: FinancialMetrics; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    const validated = MetricsParamsSchema.safeParse(params);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    let { dateRange, locationId, terminalId } = validated.data;

    // RBAC: Restricciones por rol
    if (!ADMIN_ROLES.includes(session.role)) {
        if (session.role === 'CASHIER' || session.role === 'CAJERO') {
            // Cajero solo puede ver su terminal
            if (!session.terminalId) {
                return { success: false, error: 'No tienes terminal asignado' };
            }
            terminalId = session.terminalId;
            locationId = session.locationId;
        } else if (MANAGER_ROLES.includes(session.role)) {
            // Manager solo puede ver su ubicación
            if (session.locationId) {
                locationId = session.locationId;
            }
        }
    }

    // Verificar caché
    const cacheKey = getCacheKey({ dateRange, locationId, terminalId }, session.userId);
    const cached = getFromCache(cacheKey);
    if (cached) {
        return { success: true, data: cached };
    }

    try {
        const fromStr = dateRange.from.toISOString();
        const toStr = dateRange.to.toISOString();

        // Queries parametrizados (sin concatenación)
        const baseParams: any[] = [fromStr, toStr];
        let paramIndex = 3;

        // Construir condiciones de forma segura
        let salesLocationCondition = '';
        let salesTerminalCondition = '';
        let cashCondition = '';

        if (locationId) {
            salesLocationCondition = `AND location_id = $${paramIndex}::uuid`;
            cashCondition = `AND terminal_id IN (SELECT id FROM terminals WHERE location_id = $${paramIndex}::uuid)`;
            baseParams.push(locationId);
            paramIndex++;
        }

        if (terminalId) {
            salesTerminalCondition = `AND terminal_id = $${paramIndex}::uuid`;
            if (!locationId) {
                cashCondition = `AND terminal_id = $${paramIndex}::uuid`;
            } else {
                cashCondition += ` AND terminal_id = $${paramIndex}::uuid`;
            }
            baseParams.push(terminalId);
            paramIndex++;
        }

        // 1. Resumen de ventas
        const salesRes = await query(`
            SELECT 
                COALESCE(SUM(total_amount), 0) as total,
                COUNT(*) as count,
                COALESCE(SUM(CASE WHEN payment_method = 'CASH' THEN total_amount ELSE 0 END), 0) as cash,
                COALESCE(SUM(CASE WHEN payment_method = 'DEBIT' THEN total_amount ELSE 0 END), 0) as debit,
                COALESCE(SUM(CASE WHEN payment_method = 'CREDIT' THEN total_amount ELSE 0 END), 0) as credit,
                COALESCE(SUM(CASE WHEN payment_method = 'TRANSFER' THEN total_amount ELSE 0 END), 0) as transfer
            FROM sales 
            WHERE timestamp >= $1::timestamp AND timestamp <= $2::timestamp
            ${salesLocationCondition} ${salesTerminalCondition}
        `, baseParams);

        const sRow = salesRes.rows[0];

        // 2. Movimientos de caja
        const cashRes = await query(`
            SELECT type, COALESCE(SUM(amount), 0) as total
            FROM cash_movements
            WHERE timestamp >= $1::timestamp AND timestamp <= $2::timestamp ${cashCondition}
            GROUP BY type
        `, baseParams);

        const cashMap = new Map<string, number>();
        cashRes.rows.forEach((r: any) => cashMap.set(r.type, parseFloat(r.total)));

        const baseCash = cashMap.get('APERTURA') || 0;
        const extraIncome = cashMap.get('INGRESO') || 0;
        const realExpenses = (cashMap.get('GASTO') || 0) + (cashMap.get('RETIRO') || 0);
        const salesCash = parseFloat(sRow.cash);
        const netCashFlow = baseCash + salesCash + extraIncome - realExpenses;

        // 3. Breakdown
        let breakdown: { id: string; name: string; total: number }[] = [];

        if (!locationId && !terminalId) {
            // Global → Por ubicación
            const bdRes = await query(`
                SELECT l.id, l.name, COALESCE(SUM(s.total_amount), 0) as total
                FROM locations l
                LEFT JOIN sales s ON s.location_id = l.id 
                    AND s.timestamp >= $1::timestamp AND s.timestamp <= $2::timestamp
                WHERE l.type = 'STORE'
                GROUP BY l.id, l.name
                ORDER BY total DESC
            `, [fromStr, toStr]);
            breakdown = bdRes.rows.map((r: any) => ({
                id: r.id,
                name: r.name,
                total: parseFloat(r.total),
            }));
        } else if (locationId && !terminalId) {
            // Ubicación → Por terminal
            const bdRes = await query(`
                SELECT t.id, t.name, COALESCE(SUM(s.total_amount), 0) as total
                FROM terminals t
                LEFT JOIN sales s ON s.terminal_id = t.id 
                    AND s.timestamp >= $1::timestamp AND s.timestamp <= $2::timestamp
                WHERE t.location_id = $3::uuid
                GROUP BY t.id, t.name
                ORDER BY total DESC
            `, [fromStr, toStr, locationId]);
            breakdown = bdRes.rows.map((r: any) => ({
                id: r.id,
                name: r.name,
                total: parseFloat(r.total),
            }));
        }

        const result: FinancialMetrics = {
            summary: {
                total_sales: parseFloat(sRow.total),
                sales_count: parseInt(sRow.count),
                total_income_other: extraIncome,
                total_expenses: realExpenses,
                base_cash: baseCash,
                net_cash_flow: netCashFlow,
            },
            by_payment_method: {
                cash: parseFloat(sRow.cash),
                debit: parseFloat(sRow.debit),
                credit: parseFloat(sRow.credit),
                transfer: parseFloat(sRow.transfer),
                others: 0,
            },
            breakdown,
        };

        // Cachear resultado
        setCache(cacheKey, result);

        // Auditar acceso
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'DASHBOARD_ACCESS', 'METRICS', $2::jsonb, NOW())
        `, [session.userId, JSON.stringify({
            date_range: { from: fromStr, to: toStr },
            location_id: locationId,
            terminal_id: terminalId,
        })]);

        return { success: true, data: result };

    } catch (error: any) {
        logger.error({ error }, '[Dashboard] Get metrics error');
        return { success: false, error: 'Error obteniendo métricas' };
    }
}

// ============================================================================
// SALES SUMMARY (RBAC)
// ============================================================================

/**
 * 📈 Resumen de Ventas
 */
export async function getSalesSummarySecure(
    dateRange: { from: Date; to: Date }
): Promise<{ success: boolean; data?: any; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    try {
        let locationFilter = '';
        const params: any[] = [dateRange.from.toISOString(), dateRange.to.toISOString()];

        if (!ADMIN_ROLES.includes(session.role) && session.locationId) {
            locationFilter = 'AND location_id = $3::uuid';
            params.push(session.locationId);
        }

        const res = await query(`
            SELECT 
                DATE(timestamp) as date,
                COUNT(*) as count,
                SUM(total_amount) as total
            FROM sales
            WHERE timestamp >= $1::timestamp AND timestamp <= $2::timestamp ${locationFilter}
            GROUP BY DATE(timestamp)
            ORDER BY date DESC
        `, params);

        return { success: true, data: res.rows };

    } catch (error: any) {
        logger.error({ error }, '[Dashboard] Sales summary error');
        return { success: false, error: 'Error obteniendo resumen' };
    }
}

// ============================================================================
// CASH FLOW (RBAC)
// ============================================================================

/**
 * 💰 Flujo de Caja
 */
export async function getCashFlowSecure(
    dateRange: { from: Date; to: Date }
): Promise<{ success: boolean; data?: any; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    // Solo MANAGER+ puede ver flujo de caja
    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Acceso denegado' };
    }

    try {
        let terminalFilter = '';
        const params: any[] = [dateRange.from.toISOString(), dateRange.to.toISOString()];

        if (!ADMIN_ROLES.includes(session.role) && session.locationId) {
            terminalFilter = 'AND terminal_id IN (SELECT id FROM terminals WHERE location_id = $3::uuid)';
            params.push(session.locationId);
        }

        const res = await query(`
            SELECT 
                DATE(timestamp) as date,
                type,
                SUM(amount) as total
            FROM cash_movements
            WHERE timestamp >= $1::timestamp AND timestamp <= $2::timestamp ${terminalFilter}
            GROUP BY DATE(timestamp), type
            ORDER BY date DESC, type
        `, params);

        return { success: true, data: res.rows };

    } catch (error: any) {
        logger.error({ error }, '[Dashboard] Cash flow error');
        return { success: false, error: 'Error obteniendo flujo' };
    }
}
// ============================================================================
// EXECUTIVE DASHBOARD (ADMIN)
// ============================================================================

export interface ExecutiveMetrics {
    revenue: {
        current: number;
        previous: number;
        growth: number;
    };
    aov: {
        current: number;
        previous: number;
        growth: number;
    };
    grossProfit: {
        value: number;
        margin: number;
    };
    salesByLocation: { name: string; total: number }[];
    recentSales: { id: string; amount: number; timestamp: string; location: string }[];
}

/**
 * 👑 Obtener Métricas de Dashboard Ejecutivo (ADMIN+)
 */
export async function getExecutiveDashboardMetricsSecure(): Promise<{ success: boolean; data?: ExecutiveMetrics; error?: string }> {
    const session = await getSession();
    if (!session || !ADMIN_ROLES.includes(session.role)) {
        return { success: false, error: 'Acceso denegado. Requiere privilegios administrativos.' };
    }

    const cacheKey = getCacheKey({ type: 'executive' }, session.userId);
    const cached = getFromCache(cacheKey);
    if (cached) return { success: true, data: cached };

    try {
        const now = new Date();
        const startOfCurrent = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfPrevious = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfPrevious = new Date(now.getFullYear(), now.getMonth(), 0);

        // 1. Current Month Revenue & Count
        const currentRes = await query(`
            SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count
            FROM sales 
            WHERE timestamp >= $1::timestamp
        `, [startOfCurrent.toISOString()]);

        // 2. Previous Month Revenue & Count
        const previousRes = await query(`
            SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count
            FROM sales 
            WHERE timestamp >= $1::timestamp AND timestamp <= $2::timestamp
        `, [startOfPrevious.toISOString(), endOfPrevious.toISOString()]);

        const currTotal = parseFloat(currentRes.rows[0].total);
        const currCount = parseInt(currentRes.rows[0].count);
        const prevTotal = parseFloat(previousRes.rows[0].total);
        const prevCount = parseInt(previousRes.rows[0].count);

        const revGrowth = prevTotal > 0 ? ((currTotal - prevTotal) / prevTotal) * 100 : 0;
        const currAov = currCount > 0 ? currTotal / currCount : 0;
        const prevAov = prevCount > 0 ? prevTotal / prevCount : 0;
        const aovGrowth = prevAov > 0 ? ((currAov - prevAov) / prevAov) * 100 : 0;

        // 3. Gross Profit (Simplified estimation based on product costs)
        // Note: This requires joining with product costs, approximating for now
        const profitRes = await query(`
            SELECT 
                SUM(s.total_amount) as revenue,
                SUM(si.quantity * COALESCE(p.cost_price, 0)) as cost
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            JOIN products p ON si.product_id = p.id
            WHERE s.timestamp >= $1::timestamp
        `, [startOfCurrent.toISOString()]);

        const revenue = parseFloat(profitRes.rows[0]?.revenue) || currTotal;
        const cost = parseFloat(profitRes.rows[0]?.cost) || (revenue * 0.7); // 30% margin fallback
        const grossProfitValue = revenue - cost;
        const grossMargin = revenue > 0 ? (grossProfitValue / revenue) * 100 : 0;

        // 4. Sales by Location
        const locRes = await query(`
            SELECT l.name, SUM(s.total_amount) as total
            FROM sales s
            JOIN locations l ON s.location_id = l.id
            WHERE s.timestamp >= $1::timestamp
            GROUP BY l.name
            ORDER BY total DESC
        `, [startOfCurrent.toISOString()]);

        // 5. Recent Sales
        const recentRes = await query(`
            SELECT s.id, s.total_amount as amount, s.timestamp, l.name as location
            FROM sales s
            JOIN locations l ON s.location_id = l.id
            ORDER BY s.timestamp DESC
            LIMIT 10
        `);

        const data: ExecutiveMetrics = {
            revenue: { current: currTotal, previous: prevTotal, growth: revGrowth },
            aov: { current: currAov, previous: prevAov, growth: aovGrowth },
            grossProfit: { value: grossProfitValue, margin: grossMargin },
            salesByLocation: locRes.rows.map(r => ({ name: r.name, total: parseFloat(r.total) })),
            recentSales: recentRes.rows.map(r => ({
                id: r.id,
                amount: parseFloat(r.amount),
                timestamp: r.timestamp,
                location: r.location
            }))
        };

        setCache(cacheKey, data);
        return { success: true, data };

    } catch (error: any) {
        logger.error({ error }, '[Dashboard] Executive metrics error');
        return { success: false, error: 'Error calculando métricas de gerencia' };
    }
}
