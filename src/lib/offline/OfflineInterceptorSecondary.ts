'use client';
/**
 * OfflineInterceptorSecondary — Operaciones offline para módulos secundarios
 *
 * Extiende el OfflineInterceptor con funciones para:
 * - CRM / Clientes
 * - RRHH / Empleados
 * - Horarios / Turnos
 * - Gestión de Red
 * - Tesorería
 * - Cierre Mensual
 * - Configuraciones
 *
 * Todas las funciones detectan Electron automáticamente y son no-ops en web.
 */

// ─────────────────────────────────────────────────
// ELECTRON API ACCESS
// ─────────────────────────────────────────────────
function getAPI(): any | null {
    if (typeof window !== 'undefined' && 'electronAPI' in window) {
        const api = (window as any).electronAPI;
        if (api?.isElectron) return api;
    }
    return null;
}

// ─────────────────────────────────────────────────
// CRM / CLIENTES
// ─────────────────────────────────────────────────

/** Guardar/actualizar cliente offline */
export async function saveOfflineClient(client: {
    id: string;
    name: string;
    rut?: string;
    email?: string;
    phone?: string;
    address?: string;
    birthDate?: string;
    loyaltyPoints?: number;
    notes?: string;
}): Promise<boolean> {
    const api = getAPI();
    if (!api) return false;

    try {
        await api.offlineDB.upsert('clients', {
            id: client.id,
            name: client.name,
            rut: client.rut || null,
            email: client.email || null,
            phone: client.phone || null,
            address: client.address || null,
            birth_date: client.birthDate || null,
            loyalty_points: client.loyaltyPoints || 0,
            notes: client.notes || null,
            is_active: 1,
            updated_at: new Date().toISOString(),
        });
        await api.sync.enqueue('clients', 'INSERT', client.id, client);
        return true;
    } catch (err) {
        console.error('[OfflineSecondary] ❌ Failed to save client:', err);
        return false;
    }
}

/** Registrar transacción de loyalty offline */
export async function saveOfflineLoyaltyTransaction(transaction: {
    clientId: string;
    type: 'earn' | 'redeem';
    points: number;
    amount: number;
    referenceId?: string;
}): Promise<boolean> {
    const api = getAPI();
    if (!api) return false;

    try {
        const id = `lt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await api.offlineDB.upsert('client_transactions', {
            id,
            client_id: transaction.clientId,
            type: transaction.type,
            points: transaction.points,
            amount: transaction.amount,
            reference_id: transaction.referenceId || null,
            synced: 0,
        });

        // Actualizar puntos del cliente localmente
        const client = await api.offlineDB.getById('clients', transaction.clientId) as any;
        if (client) {
            const delta = transaction.type === 'earn' ? transaction.points : -transaction.points;
            await api.offlineDB.upsert('clients', {
                ...client,
                loyalty_points: Math.max(0, (client.loyalty_points || 0) + delta),
            });
        }

        await api.sync.enqueue('client_transactions', 'INSERT', id, transaction);
        return true;
    } catch (err) {
        console.error('[OfflineSecondary] ❌ Failed to save loyalty transaction:', err);
        return false;
    }
}

// ─────────────────────────────────────────────────
// RRHH / EMPLEADOS
// ─────────────────────────────────────────────────

/** Guardar/actualizar empleado offline */
export async function saveOfflineEmployee(employee: {
    id: string;
    userId?: string;
    name: string;
    rut?: string;
    position?: string;
    department?: string;
    contractType?: string;
    hireDate?: string;
    salary?: number;
    data?: Record<string, unknown>;
}): Promise<boolean> {
    const api = getAPI();
    if (!api) return false;

    try {
        await api.offlineDB.upsert('employees', {
            id: employee.id,
            user_id: employee.userId || null,
            name: employee.name,
            rut: employee.rut || null,
            position: employee.position || null,
            department: employee.department || null,
            contract_type: employee.contractType || null,
            hire_date: employee.hireDate || null,
            salary: employee.salary || null,
            is_active: 1,
            data: employee.data ? JSON.stringify(employee.data) : null,
            updated_at: new Date().toISOString(),
        });
        await api.sync.enqueue('employees', 'INSERT', employee.id, employee);
        return true;
    } catch (err) {
        console.error('[OfflineSecondary] ❌ Failed to save employee:', err);
        return false;
    }
}

/** Registrar asistencia offline */
export async function saveOfflineAttendance(record: {
    employeeId: string;
    date: string;
    checkIn?: string;
    checkOut?: string;
    hoursWorked?: number;
    status?: string;
    notes?: string;
}): Promise<boolean> {
    const api = getAPI();
    if (!api) return false;

    try {
        const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await api.offlineDB.upsert('attendance', {
            id,
            employee_id: record.employeeId,
            date: record.date,
            check_in: record.checkIn || null,
            check_out: record.checkOut || null,
            hours_worked: record.hoursWorked || null,
            status: record.status || 'present',
            notes: record.notes || null,
            synced: 0,
        });
        await api.sync.enqueue('attendance', 'INSERT', id, record);
        return true;
    } catch (err) {
        console.error('[OfflineSecondary] ❌ Failed to save attendance:', err);
        return false;
    }
}

// ─────────────────────────────────────────────────
// HORARIOS / TURNOS
// ─────────────────────────────────────────────────

/** Guardar turno/horario offline */
export async function saveOfflineSchedule(schedule: {
    id: string;
    locationId: string;
    employeeId: string;
    date: string;
    startTime: string;
    endTime: string;
    type?: string;
    status?: string;
    notes?: string;
}): Promise<boolean> {
    const api = getAPI();
    if (!api) return false;

    try {
        await api.offlineDB.upsert('schedules', {
            id: schedule.id,
            location_id: schedule.locationId,
            employee_id: schedule.employeeId,
            date: schedule.date,
            start_time: schedule.startTime,
            end_time: schedule.endTime,
            type: schedule.type || 'regular',
            status: schedule.status || 'scheduled',
            notes: schedule.notes || null,
            updated_at: new Date().toISOString(),
            synced: 0,
        });
        await api.sync.enqueue('schedules', 'INSERT', schedule.id, schedule);
        return true;
    } catch (err) {
        console.error('[OfflineSecondary] ❌ Failed to save schedule:', err);
        return false;
    }
}

// ─────────────────────────────────────────────────
// TESORERÍA
// ─────────────────────────────────────────────────

/** Guardar cuenta de tesorería offline */
export async function saveOfflineTreasuryAccount(account: {
    id: string;
    name: string;
    type: string;
    balance: number;
    currency?: string;
}): Promise<boolean> {
    const api = getAPI();
    if (!api) return false;

    try {
        await api.offlineDB.upsert('treasury_accounts', {
            id: account.id,
            name: account.name,
            type: account.type,
            balance: account.balance,
            currency: account.currency || 'CLP',
            is_active: 1,
            updated_at: new Date().toISOString(),
        });
        await api.sync.enqueue('treasury_accounts', 'INSERT', account.id, account);
        return true;
    } catch (err) {
        console.error('[OfflineSecondary] ❌ Failed to save treasury account:', err);
        return false;
    }
}

/** Registrar movimiento de tesorería offline */
export async function saveOfflineTreasuryMovement(movement: {
    accountId: string;
    type: 'income' | 'expense' | 'transfer';
    amount: number;
    description?: string;
    category?: string;
    referenceId?: string;
    createdBy: string;
}): Promise<boolean> {
    const api = getAPI();
    if (!api) return false;

    try {
        const id = `tm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await api.offlineDB.upsert('treasury_movements', {
            id,
            account_id: movement.accountId,
            type: movement.type,
            amount: movement.amount,
            description: movement.description || null,
            category: movement.category || null,
            reference_id: movement.referenceId || null,
            created_by: movement.createdBy,
            synced: 0,
        });

        // Actualizar balance de la cuenta localmente
        const account = await api.offlineDB.getById('treasury_accounts', movement.accountId) as any;
        if (account) {
            const delta = movement.type === 'income' ? movement.amount : -movement.amount;
            await api.offlineDB.upsert('treasury_accounts', {
                ...account,
                balance: (account.balance || 0) + delta,
            });
        }

        await api.sync.enqueue('treasury_movements', 'INSERT', id, movement);
        return true;
    } catch (err) {
        console.error('[OfflineSecondary] ❌ Failed to save treasury movement:', err);
        return false;
    }
}

// ─────────────────────────────────────────────────
// CIERRE MENSUAL
// ─────────────────────────────────────────────────

/** Generar cierre mensual offline */
export async function saveOfflineMonthlyClosing(closing: {
    id: string;
    locationId: string;
    period: string; // YYYY-MM
    totalSales: number;
    totalExpenses: number;
    totalPurchases: number;
    netResult: number;
    snapshot: Record<string, unknown>;
    createdBy: string;
}): Promise<boolean> {
    const api = getAPI();
    if (!api) return false;

    try {
        await api.offlineDB.upsert('monthly_closings', {
            id: closing.id,
            location_id: closing.locationId,
            period: closing.period,
            total_sales: closing.totalSales,
            total_expenses: closing.totalExpenses,
            total_purchases: closing.totalPurchases,
            net_result: closing.netResult,
            status: 'draft',
            snapshot: JSON.stringify(closing.snapshot),
            created_by: closing.createdBy,
            synced: 0,
        });
        await api.sync.enqueue('monthly_closings', 'INSERT', closing.id, closing);
        return true;
    } catch (err) {
        console.error('[OfflineSecondary] ❌ Failed to save monthly closing:', err);
        return false;
    }
}

// ─────────────────────────────────────────────────
// CONFIGURACIONES
// ─────────────────────────────────────────────────

/** Guardar configuración offline */
export async function saveOfflineSetting(key: string, value: unknown): Promise<boolean> {
    const api = getAPI();
    if (!api) return false;

    try {
        await api.offlineDB.upsert('app_settings', {
            key,
            value: typeof value === 'string' ? value : JSON.stringify(value),
            updated_at: new Date().toISOString(),
        });
        await api.sync.enqueue('app_settings', 'INSERT', key, { key, value });
        return true;
    } catch (err) {
        console.error('[OfflineSecondary] ❌ Failed to save setting:', err);
        return false;
    }
}

/** Obtener configuración offline */
export async function getOfflineSetting<T = string>(key: string, defaultValue?: T): Promise<T | null> {
    const api = getAPI();
    if (!api) return defaultValue ?? null;

    try {
        const rows = await api.offlineDB.getAll('app_settings', { key }) as any[];
        if (rows.length > 0) {
            try {
                return JSON.parse(rows[0].value) as T;
            } catch {
                return rows[0].value as T;
            }
        }
        return defaultValue ?? null;
    } catch (err) {
        return defaultValue ?? null;
    }
}

/** Obtener todas las configuraciones offline */
export async function getAllOfflineSettings(): Promise<Record<string, unknown>> {
    const api = getAPI();
    if (!api) return {};

    try {
        const rows = await api.offlineDB.getAll('app_settings') as any[];
        const settings: Record<string, unknown> = {};
        for (const row of rows) {
            try {
                settings[row.key] = JSON.parse(row.value);
            } catch {
                settings[row.key] = row.value;
            }
        }
        return settings;
    } catch {
        return {};
    }
}

// ─────────────────────────────────────────────────
// GESTIÓN DE RED (Network Status por sucursal)
// ─────────────────────────────────────────────────

/** Actualizar estado de red para una sucursal */
export async function updateOfflineNetworkStatus(locationId: string, data: {
    name: string;
    status: string;
    metrics?: Record<string, unknown>;
}): Promise<boolean> {
    const api = getAPI();
    if (!api) return false;

    try {
        await api.offlineDB.upsert('network_status', {
            location_id: locationId,
            name: data.name,
            status: data.status,
            last_seen: new Date().toISOString(),
            metrics: data.metrics ? JSON.stringify(data.metrics) : null,
            updated_at: new Date().toISOString(),
        });
        return true;
    } catch (err) {
        console.error('[OfflineSecondary] ❌ Failed to update network status:', err);
        return false;
    }
}

// ─────────────────────────────────────────────────
// MIRROR SECUNDARIO (copiar datos de módulos secundarios a SQLite)
// ─────────────────────────────────────────────────

/**
 * Extiende mirrorStoreToSQLite con datos de módulos secundarios.
 * Llamar después del sync de datos secundarios.
 */
export async function mirrorSecondaryToSQLite(data: {
    attendanceLogs?: unknown[];
    schedules?: unknown[];
    printerConfig?: Record<string, unknown>;
    loyaltyConfig?: Record<string, unknown>;
}) {
    const api = getAPI();
    if (!api) return;

    const tasks: Promise<unknown>[] = [];

    // Mirror attendance logs
    if (data.attendanceLogs?.length) {
        const records = (data.attendanceLogs as any[]).map(a => ({
            id: a.id || `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            employee_id: a.employee_id || a.employeeId,
            date: a.date || new Date().toISOString().slice(0, 10),
            check_in: a.check_in || a.checkIn || null,
            check_out: a.check_out || a.checkOut || null,
            hours_worked: a.hours_worked || a.hoursWorked || null,
            status: a.status || 'present',
            notes: a.observation || a.notes || null,
            synced: 1,
        }));
        tasks.push(api.offlineDB.upsertMany('attendance', records));
    }

    // Mirror schedules
    if (data.schedules?.length) {
        const records = (data.schedules as any[]).map(s => ({
            id: s.id,
            location_id: s.location_id || s.locationId,
            employee_id: s.employee_id || s.employeeId,
            date: s.date,
            start_time: s.start_time || s.startTime,
            end_time: s.end_time || s.endTime,
            type: s.type || 'regular',
            status: s.status || 'scheduled',
            notes: s.notes || null,
            updated_at: new Date().toISOString(),
            synced: 1,
        }));
        tasks.push(api.offlineDB.upsertMany('schedules', records));
    }

    // Mirror configurations
    if (data.printerConfig) {
        tasks.push(api.offlineDB.upsert('app_settings', {
            key: 'printer_config',
            value: JSON.stringify(data.printerConfig),
            updated_at: new Date().toISOString(),
        }));
    }

    if (data.loyaltyConfig) {
        tasks.push(api.offlineDB.upsert('app_settings', {
            key: 'loyalty_config',
            value: JSON.stringify(data.loyaltyConfig),
            updated_at: new Date().toISOString(),
        }));
    }

    await Promise.all(tasks);
    console.log('[OfflineSecondary] ✅ Secondary data mirrored to SQLite');
}
