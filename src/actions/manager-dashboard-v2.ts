'use server';

import { query } from '@/lib/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { headers } from 'next/headers';
import * as Sentry from "@sentry/nextjs";

// ==========================================
// TYPES
// ==========================================

export interface BranchSummary {
    id: string;
    name: string;
    totalSales: number;
    transactionCount: number;
}

export interface FinancialBreakdown {
    cash: number;
    debit: number;
    credit: number;
    transfer: number;
    otherIncome: number;
    expenses: number;
    totalCollected: number;
}

export interface TerminalStatus {
    id: string;
    name: string;
    financials: FinancialBreakdown;
    session: {
        isOpen: boolean;
        userName?: string;
        startTime?: string; // ISO string
        sessionId?: string;
    } | null;
}

export interface ShiftInfo {
    id: string;
    userName: string;
    terminalName: string;
    openedAt: string; // ISO string
    closedAt?: string; // ISO string
    status: 'OPEN' | 'CLOSED';
}

export interface ActiveStaff {
    id: string;
    name: string;
    role: string;
    jobTitle: string;
    checkInTime: string; // ISO string
    status: 'IN' | 'LUNCH' | 'BREAK';
    locationArea: string; // 'SALA', 'BODEGA', etc.
}

export interface BranchDetail {
    locationId: string;
    locationName: string;
    financials: FinancialBreakdown;
    terminals: TerminalStatus[];
    shifts: ShiftInfo[];
    activeStaff: ActiveStaff[];
}

export interface ManagerDashboardData {
    branches: BranchSummary[];
    selectedBranch?: BranchDetail;
}

// ==========================================
// HELPERS
// ==========================================

async function getSession() {
    const headersList = await headers();
    const userId = headersList.get('x-user-id');
    const role = headersList.get('x-user-role');
    return { userId, role };
}

const AUTHORIZED_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'];

// ==========================================
// MAIN ACTION
// ==========================================

export async function getManagerRealTimeDataSecure(
    selectedLocationId?: string
): Promise<{ success: boolean; data?: ManagerDashboardData; error?: string }> {
    try {
        const session = await getSession();
        if (!session.userId || !session.role || !AUTHORIZED_ROLES.includes(session.role)) {
            return { success: false, error: 'Acceso denegado: Rol no autorizado' };
        }

        // 1. Get Branch Summaries (All Stores)
        // ---------------------------------------------------------
        const branchRes = await query(`
            SELECT 
                l.id, 
                l.name, 
                COALESCE(SUM(s.total_amount), 0) as total_sales,
                COUNT(s.id) as transaction_count
            FROM locations l
            LEFT JOIN sales s ON s.location_id = l.id 
                AND s.status = 'COMPLETED' 
                AND DATE(s.timestamp) = CURRENT_DATE
            WHERE l.type = 'STORE' AND l.is_active = true
            GROUP BY l.id, l.name
            ORDER BY total_sales DESC, l.name ASC
        `);

        const branches: BranchSummary[] = branchRes.rows.map((r: any) => ({
            id: r.id,
            name: r.name,
            totalSales: Number(r.total_sales),
            transactionCount: Number(r.transaction_count)
        }));

        // Determine target location (selected or first available)
        const targetId = selectedLocationId || branches[0]?.id;

        if (!targetId) {
            return { success: true, data: { branches } };
        }

        // 2. Get Selected Branch Financials & Details
        // ---------------------------------------------------------

        // 2.1 Branch Financials (Aggregated)
        const financialsRes = await query(`
            WITH SalesStats AS (
                SELECT 
                    COALESCE(SUM(CASE WHEN payment_method = 'CASH' THEN total_amount ELSE 0 END), 0) as cash,
                    COALESCE(SUM(CASE WHEN payment_method = 'DEBIT' THEN total_amount ELSE 0 END), 0) as debit,
                    COALESCE(SUM(CASE WHEN payment_method = 'CREDIT' THEN total_amount ELSE 0 END), 0) as credit,
                    COALESCE(SUM(CASE WHEN payment_method = 'TRANSFER' THEN total_amount ELSE 0 END), 0) as transfer
                FROM sales
                WHERE location_id = $1::uuid 
                  AND status = 'COMPLETED' 
                  AND DATE(timestamp) = CURRENT_DATE
            ),
            CashMovements AS (
                SELECT 
                    COALESCE(SUM(CASE WHEN type = 'INGRESO' THEN amount ELSE 0 END), 0) as other_income,
                    COALESCE(SUM(CASE WHEN type IN ('GASTO', 'RETIRO') THEN amount ELSE 0 END), 0) as expenses
                FROM cash_movements cm
                JOIN terminals t ON cm.terminal_id = t.id
                WHERE t.location_id = $1::uuid
                  AND DATE(cm.timestamp) = CURRENT_DATE
            )
            SELECT * FROM SalesStats, CashMovements
        `, [targetId]);

        const fData = financialsRes.rows[0];
        const financialBreakdown: FinancialBreakdown = {
            cash: Number(fData.cash),
            debit: Number(fData.debit),
            credit: Number(fData.credit),
            transfer: Number(fData.transfer),
            otherIncome: Number(fData.other_income),
            expenses: Number(fData.expenses),
            totalCollected: Number(fData.cash) + Number(fData.debit) + Number(fData.credit) + Number(fData.transfer)
        };

        // 2.2 Terminals Status & Individual Metrics
        const terminalsRes = await query(`
            SELECT 
                t.id, 
                t.name,
                -- Current Session Info
                (
                    SELECT json_build_object(
                        'isOpen', true,
                        'userName', u.name,
                        'startTime', crs.opened_at,
                        'sessionId', crs.id
                    )
                    FROM cash_register_sessions crs
                    JOIN users u ON crs.user_id::text = u.id
                    WHERE crs.terminal_id = t.id AND crs.closed_at IS NULL
                    ORDER BY crs.opened_at DESC LIMIT 1
                ) as active_session,
                -- Today's Metrics per Terminal
                COALESCE(SUM(CASE WHEN s.payment_method = 'CASH' THEN s.total_amount ELSE 0 END), 0) as cash,
                COALESCE(SUM(CASE WHEN s.payment_method = 'DEBIT' THEN s.total_amount ELSE 0 END), 0) as debit,
                COALESCE(SUM(CASE WHEN s.payment_method = 'CREDIT' THEN s.total_amount ELSE 0 END), 0) as credit,
                COALESCE(SUM(CASE WHEN s.payment_method = 'TRANSFER' THEN s.total_amount ELSE 0 END), 0) as transfer
            FROM terminals t
            LEFT JOIN sales s ON s.terminal_id = t.id 
                AND s.status = 'COMPLETED' 
                AND DATE(s.timestamp) = CURRENT_DATE
            WHERE t.location_id = $1::uuid AND t.is_active = true
            GROUP BY t.id, t.name
            ORDER BY t.name ASC
        `, [targetId]);

        // Need separate query for terminal expenses/income as easy join is tricky with sales
        // OR execute secondary query for movements per terminal and map in JS.
        const terminalMovementsRes = await query(`
             SELECT 
                cm.terminal_id,
                COALESCE(SUM(CASE WHEN type = 'INGRESO' THEN amount ELSE 0 END), 0) as other_income,
                COALESCE(SUM(CASE WHEN type IN ('GASTO', 'RETIRO') THEN amount ELSE 0 END), 0) as expenses
            FROM cash_movements cm
            JOIN terminals t ON cm.terminal_id = t.id
            WHERE t.location_id = $1::uuid 
              AND DATE(cm.timestamp) = CURRENT_DATE
            GROUP BY cm.terminal_id
        `, [targetId]);

        const movementsMap = new Map();
        terminalMovementsRes.rows.forEach(((r: any) => {
            movementsMap.set(r.terminal_id, {
                income: Number(r.other_income),
                expenses: Number(r.expenses)
            });
        }));

        const terminals: TerminalStatus[] = terminalsRes.rows.map((row: any) => {
            const movs = movementsMap.get(row.id) || { income: 0, expenses: 0 };
            return {
                id: row.id,
                name: row.name,
                session: row.active_session ? {
                    ...row.active_session,
                    isOpen: true
                } : null,
                financials: {
                    cash: Number(row.cash),
                    debit: Number(row.debit),
                    credit: Number(row.credit),
                    transfer: Number(row.transfer),
                    otherIncome: movs.income,
                    expenses: movs.expenses,
                    totalCollected: Number(row.cash) + Number(row.debit) + Number(row.credit) + Number(row.transfer)
                }
            };
        });

        // 2.3 Shifts (Turnos de Caja hoy)
        const shiftsRes = await query(`
            SELECT 
                crs.id,
                u.name as user_name,
                t.name as terminal_name,
                crs.opened_at,
                crs.closed_at
            FROM cash_register_sessions crs
            JOIN users u ON crs.user_id::text = u.id
            JOIN terminals t ON crs.terminal_id = t.id
            WHERE t.location_id = $1::uuid
              AND DATE(crs.opened_at) = CURRENT_DATE
            ORDER BY crs.opened_at DESC
        `, [targetId]);

        const shifts: ShiftInfo[] = shiftsRes.rows.map((r: any) => ({
            id: r.id,
            userName: r.user_name,
            terminalName: r.terminal_name,
            openedAt: r.opened_at.toISOString(),
            closedAt: r.closed_at?.toISOString(),
            status: r.closed_at ? 'CLOSED' : 'OPEN'
        }));

        // 2.4 Active Staff (Asistencia)
        // Using attendance_logs mapping: CHECK_IN, CHECK_OUT, BREAK_START, BREAK_END
        const attendanceRes = await query(`
            WITH LastLogs AS (
                SELECT DISTINCT ON (user_id) 
                    user_id, type, timestamp, location_id
                FROM attendance_logs
                WHERE timestamp >= CURRENT_DATE AT TIME ZONE 'America/Santiago'
                ORDER BY user_id, timestamp DESC
            )
            SELECT 
                u.id, 
                u.name, 
                u.role, 
                u.job_title,
                ll.timestamp as check_in_time,
                CASE 
                    WHEN ll.type = 'CHECK_IN' THEN 'IN'
                    WHEN ll.type = 'BREAK_END' THEN 'IN'
                    WHEN ll.type = 'BREAK_START' THEN 'LUNCH'
                    ELSE 'OUT'
                END as status,
                CASE 
                   WHEN u.role = 'WAREHOUSE' THEN 'BODEGA' 
                   ELSE 'SALA' 
                END as location_area
            FROM LastLogs ll
            JOIN users u ON ll.user_id = u.id
            WHERE ll.type IN ('CHECK_IN', 'BREAK_END', 'BREAK_START') 
              AND u.is_active = true
              AND (u.assigned_location_id = $1::uuid OR ll.location_id = $1::uuid) -- Match assigned or current location
        `, [targetId]);

        const activeStaff: ActiveStaff[] = attendanceRes.rows.map((r: any) => ({
            id: r.id,
            name: r.name,
            role: r.role,
            jobTitle: r.job_title,
            checkInTime: r.check_in_time.toISOString(),
            status: r.status,
            locationArea: r.location_area
        }));

        // Construct response
        const locationName = branches.find(b => b.id === targetId)?.name || 'Sucursal';

        return {
            success: true,
            data: {
                branches,
                selectedBranch: {
                    locationId: targetId,
                    locationName,
                    financials: financialBreakdown,
                    terminals,
                    shifts,
                    activeStaff
                }
            }
        };

    } catch (error: any) {
        logger.error({ error }, '[ManagerDashboard] Error fetching data');
        Sentry.captureException(error);
        throw error;
    }
}
