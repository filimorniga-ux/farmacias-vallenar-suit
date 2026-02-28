'use server';

/**
 * ============================================================================
 * SCHEDULER-V2: Gestor de Horario Laboral
 * Pharma-Synapse v3.4
 * ============================================================================
 * Mejoras:
 * - RBAC y autenticación en todas las acciones
 * - Validaciones de negocio (rango horario, colación, solapes de ausencias)
 * - Queries más consistentes (color de plantilla, límites de fecha)
 * - Errores tipados y logs estructurados
 */

import { query } from '@/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { logger } from '@/lib/logger';

const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL'] as const;
const SCHEDULER_ROLES = ['ADMIN', 'GERENTE_GENERAL', 'MANAGER', 'RRHH'] as const;

const UUIDSchema = z.string().uuid('ID inválido');
const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido');

type SchedulerRole = (typeof SCHEDULER_ROLES)[number];

interface SchedulerUser {
    id: string;
    name: string;
    role: SchedulerRole;
    assignedLocationId: string | null;
}

const ShiftSchema = z.object({
    id: UUIDSchema.optional(),
    userId: z.string().min(1, 'Usuario requerido'),
    locationId: UUIDSchema,
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    assignedBy: z.string().optional(),
    notes: z.string().max(500).optional(),
    breakStartAt: z.string().datetime().optional().nullable(),
    breakEndAt: z.string().datetime().optional().nullable(),
    breakMinutes: z.number().int().min(0).max(180).optional(),
    shiftTemplateId: UUIDSchema.optional().nullable(),
    status: z.enum(['draft', 'published']).optional(),
});

const GenerateSchema = z.object({
    locationId: UUIDSchema,
    weekStart: DateOnlySchema,
});

const TemplateSchema = z.object({
    name: z.string().min(1, 'Nombre requerido').max(120),
    start: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM').optional(),
    end: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM').optional(),
    color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Color HEX inválido'),
    locationId: UUIDSchema.optional().nullable(),
    breakMinutes: z.number().int().min(0).max(180).default(0),
    isRestDay: z.boolean().default(false),
    breakStart: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM').optional(),
    breakEnd: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM').optional(),
}).refine((data) => {
    if (data.isRestDay) return true;
    return !!data.start && !!data.end;
}, {
    message: 'Inicio y término son obligatorios para días laborales',
    path: ['start'],
});

const TimeOffSchema = z.object({
    id: UUIDSchema.optional(),
    userId: z.string().min(1, 'Usuario requerido'),
    type: z.enum(['VACATION', 'SICK_LEAVE', 'PERSONAL', 'FAMILY_EMERGENCY', 'OTHER']),
    startDate: DateOnlySchema,
    endDate: DateOnlySchema,
    notes: z.string().max(500).optional(),
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('APPROVED'),
}).refine((data) => data.endDate >= data.startDate, {
    message: 'La fecha de término no puede ser anterior a la fecha de inicio',
    path: ['endDate'],
});

function addDaysToDateString(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function isAdminRole(role: string): boolean {
    return ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number]);
}

function isSchedulerRole(role: string): role is SchedulerRole {
    return SCHEDULER_ROLES.includes(role as SchedulerRole);
}

async function getSession(): Promise<{ userId: string; role: string; locationId?: string } | null> {
    try {
        const headersList = await headers();

        let userId = headersList.get('x-user-id');
        let role = headersList.get('x-user-role');
        let locationId = headersList.get('x-user-location') || undefined;

        if (!userId || !role) {
            const cookieStore = await cookies();
            userId = cookieStore.get('user_id')?.value || null;
            role = cookieStore.get('user_role')?.value || null;
            locationId = locationId || cookieStore.get('user_location')?.value || undefined;
        }

        if (!userId || !role) {
            return null;
        }

        return { userId, role: role.toUpperCase(), locationId };
    } catch {
        return null;
    }
}

async function authorizeScheduler(locationId?: string): Promise<{ ok: true; user: SchedulerUser } | { ok: false; error: string }> {
    const session = await getSession();
    if (!session?.userId) {
        return { ok: false, error: 'No autenticado' };
    }

    const userRes = await query(
        `SELECT id, name, role, assigned_location_id
         FROM users
         WHERE id = $1 AND is_active = true
         LIMIT 1`,
        [session.userId]
    );

    const dbUser = userRes.rows[0];
    if (!dbUser) {
        return { ok: false, error: 'Usuario no encontrado o inactivo' };
    }

    const role = String(dbUser.role || '').toUpperCase();
    if (!isSchedulerRole(role)) {
        return { ok: false, error: 'No autorizado para gestionar horarios' };
    }

    const user: SchedulerUser = {
        id: dbUser.id,
        name: dbUser.name,
        role,
        assignedLocationId: dbUser.assigned_location_id || null,
    };

    if (locationId && !isAdminRole(role)) {
        if (user.assignedLocationId && user.assignedLocationId !== locationId) {
            return { ok: false, error: 'No tienes acceso a esta sucursal' };
        }
        if (!user.assignedLocationId && session.locationId && session.locationId !== locationId) {
            return { ok: false, error: 'No tienes acceso a esta sucursal' };
        }
    }

    return { ok: true, user };
}

async function getTargetUserLocation(userId: string): Promise<string | null> {
    const res = await query('SELECT assigned_location_id FROM users WHERE id = $1 LIMIT 1', [userId]);
    return res.rows[0]?.assigned_location_id || null;
}

function validateShiftMath(params: {
    startAt: string;
    endAt: string;
    breakStartAt?: string | null;
    breakEndAt?: string | null;
    breakMinutes?: number;
}): { valid: true; netHours: number; grossHours: number } | { valid: false; error: string } {
    const { startAt, endAt, breakStartAt, breakEndAt, breakMinutes = 0 } = params;

    const start = new Date(startAt);
    const end = new Date(endAt);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return { valid: false, error: 'Fecha/hora inválida en turno' };
    }

    const grossHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    if (grossHours <= 0) {
        return { valid: false, error: 'La hora de término debe ser posterior al inicio' };
    }
    if (grossHours > 24) {
        return { valid: false, error: 'Un turno no puede exceder 24 horas' };
    }

    if ((breakStartAt && !breakEndAt) || (!breakStartAt && breakEndAt)) {
        return { valid: false, error: 'Debe indicar inicio y fin de colación' };
    }

    if (breakStartAt && breakEndAt) {
        const bStart = new Date(breakStartAt);
        const bEnd = new Date(breakEndAt);
        if (Number.isNaN(bStart.getTime()) || Number.isNaN(bEnd.getTime()) || bEnd <= bStart) {
            return { valid: false, error: 'Rango de colación inválido' };
        }
        if (bStart < start || bEnd > end) {
            return { valid: false, error: 'La colación debe estar dentro del turno' };
        }
    }

    const maxBreakMinutes = Math.round(grossHours * 60);
    if (breakMinutes < 0 || breakMinutes > maxBreakMinutes) {
        return { valid: false, error: 'Colación inválida para la duración del turno' };
    }

    const netHours = grossHours - breakMinutes / 60;
    if (netHours <= 0) {
        return { valid: false, error: 'La duración neta del turno debe ser mayor a 0' };
    }

    return { valid: true, netHours, grossHours };
}

export async function createShiftTemplate(data: z.infer<typeof TemplateSchema>) {
    const parsed = TemplateSchema.safeParse(data);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || 'Datos inválidos' };
    }

    const auth = await authorizeScheduler(parsed.data.locationId || undefined);
    if (!auth.ok) return { success: false, error: auth.error };

    const { name, start, end, color, locationId, breakMinutes, isRestDay, breakStart, breakEnd } = parsed.data;

    try {
        await query(
            `INSERT INTO shift_templates
                (name, start_time, end_time, color, location_id, is_active, break_minutes, is_rest_day, break_start_time, break_end_time)
             VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9)`,
            [
                name,
                start || '00:00',
                end || '00:00',
                color,
                locationId || null,
                breakMinutes,
                isRestDay,
                breakStart || null,
                breakEnd || null,
            ]
        );

        revalidatePath('/rrhh/horarios');
        return { success: true };
    } catch (error) {
        logger.error({ error, locationId, name }, '[Scheduler] createShiftTemplate failed');
        return { success: false, error: 'No fue posible crear la plantilla' };
    }
}

export async function deleteShiftTemplate(id: string) {
    if (!UUIDSchema.safeParse(id).success) {
        return { success: false, error: 'ID de plantilla inválido' };
    }

    try {
        const templateRes = await query('SELECT location_id FROM shift_templates WHERE id = $1 LIMIT 1', [id]);
        if (templateRes.rows.length === 0) {
            return { success: false, error: 'Plantilla no encontrada' };
        }

        const auth = await authorizeScheduler(templateRes.rows[0]?.location_id || undefined);
        if (!auth.ok) return { success: false, error: auth.error };

        await query('DELETE FROM shift_templates WHERE id = $1', [id]);
        revalidatePath('/rrhh/horarios');
        return { success: true };
    } catch (error) {
        logger.error({ error, id }, '[Scheduler] deleteShiftTemplate failed');
        return { success: false, error: 'No fue posible eliminar la plantilla' };
    }
}

export async function upsertTimeOffRequest(data: z.infer<typeof TimeOffSchema>) {
    const parsed = TimeOffSchema.safeParse(data);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || 'Datos inválidos' };
    }

    const { id, userId, type, startDate, endDate, notes, status } = parsed.data;

    try {
        const targetLocationId = await getTargetUserLocation(userId);
        const auth = await authorizeScheduler(targetLocationId || undefined);
        if (!auth.ok) return { success: false, error: auth.error };

        const overlapRes = await query(
            `SELECT id
             FROM time_off_requests
             WHERE user_id = $1
               AND status IN ('PENDING', 'APPROVED')
               AND daterange(start_date, end_date, '[]') && daterange($2::date, $3::date, '[]')
               AND ($4::uuid IS NULL OR id <> $4::uuid)
             LIMIT 1`,
            [userId, startDate, endDate, id || null]
        );

        if (overlapRes.rows.length > 0) {
            return { success: false, error: 'Ya existe una ausencia en ese rango para este colaborador' };
        }

        if (id) {
            await query(
                `UPDATE time_off_requests
                 SET type = $2, start_date = $3, end_date = $4, notes = $5, status = $6, updated_at = NOW()
                 WHERE id = $1`,
                [id, type, startDate, endDate, notes || null, status]
            );
        } else {
            await query(
                `INSERT INTO time_off_requests (user_id, type, start_date, end_date, notes, status)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [userId, type, startDate, endDate, notes || null, status]
            );
        }

        revalidatePath('/rrhh/horarios');
        return { success: true };
    } catch (error) {
        logger.error({ error, userId, id }, '[Scheduler] upsertTimeOffRequest failed');
        return { success: false, error: 'No fue posible guardar la ausencia' };
    }
}

export async function upsertShiftV2(data: z.infer<typeof ShiftSchema>) {
    const parsed = ShiftSchema.safeParse(data);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || 'Datos inválidos' };
    }

    const {
        id,
        userId,
        locationId,
        startAt,
        endAt,
        assignedBy,
        notes,
        breakStartAt,
        breakEndAt,
        breakMinutes,
        shiftTemplateId,
        status,
    } = parsed.data;

    const auth = await authorizeScheduler(locationId);
    if (!auth.ok) return { success: false, error: auth.error };

    const validation = validateShiftMath({
        startAt,
        endAt,
        breakStartAt,
        breakEndAt,
        breakMinutes: breakMinutes || 0,
    });

    if (!validation.valid) {
        return { success: false, error: validation.error };
    }

    try {
        const contractRes = await query('SELECT weekly_hours FROM staff_contracts WHERE user_id = $1', [userId]);
        const weeklyInfo = Number(contractRes.rows[0]?.weekly_hours || 45);
        const isOvertime = validation.netHours > (weeklyInfo / 5);

        if (id) {
            const updateResult = await query(
                `UPDATE employee_shifts
                 SET start_at = $1,
                     end_at = $2,
                     location_id = $3,
                     user_id = $4,
                     is_overtime = $5,
                     notes = $6,
                     break_start_at = $7,
                     break_end_at = $8,
                     break_minutes = $9,
                     shift_template_id = $10,
                     assigned_by = COALESCE($11, assigned_by),
                     status = COALESCE($12, status),
                     updated_at = NOW()
                 WHERE id = $13`,
                [
                    startAt,
                    endAt,
                    locationId,
                    userId,
                    isOvertime,
                    notes || null,
                    breakStartAt || null,
                    breakEndAt || null,
                    breakMinutes || 0,
                    shiftTemplateId || null,
                    assignedBy || auth.user.id,
                    status || null,
                    id,
                ]
            );

            if (!updateResult.rowCount) {
                return { success: false, error: 'Turno no encontrado' };
            }
        } else {
            await query(
                `INSERT INTO employee_shifts
                    (user_id, location_id, start_at, end_at, assigned_by, status, is_overtime, notes,
                     break_start_at, break_end_at, break_minutes, shift_template_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                [
                    userId,
                    locationId,
                    startAt,
                    endAt,
                    assignedBy || auth.user.id,
                    status || 'published',
                    isOvertime,
                    notes || null,
                    breakStartAt || null,
                    breakEndAt || null,
                    breakMinutes || 0,
                    shiftTemplateId || null,
                ]
            );
        }

        revalidatePath('/rrhh/horarios');
        return { success: true };
    } catch (error) {
        logger.error({ error, userId, locationId, shiftId: id }, '[Scheduler] upsertShiftV2 failed');
        return { success: false, error: 'No fue posible guardar el turno' };
    }
}

export async function deleteShiftV2(shiftId: string) {
    if (!UUIDSchema.safeParse(shiftId).success) {
        return { success: false, error: 'ID de turno inválido' };
    }

    try {
        const shiftRes = await query('SELECT location_id FROM employee_shifts WHERE id = $1 LIMIT 1', [shiftId]);
        if (shiftRes.rows.length === 0) {
            return { success: false, error: 'Turno no encontrado' };
        }

        const auth = await authorizeScheduler(shiftRes.rows[0]?.location_id);
        if (!auth.ok) return { success: false, error: auth.error };

        await query('DELETE FROM employee_shifts WHERE id = $1', [shiftId]);
        revalidatePath('/rrhh/horarios');
        return { success: true };
    } catch (error) {
        logger.error({ error, shiftId }, '[Scheduler] deleteShiftV2 failed');
        return { success: false, error: 'No fue posible eliminar el turno' };
    }
}

export async function generateDraftScheduleV2(data: z.infer<typeof GenerateSchema>) {
    const parsed = GenerateSchema.safeParse(data);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || 'Parámetros inválidos' };
    }

    const { locationId, weekStart } = parsed.data;

    const auth = await authorizeScheduler(locationId);
    if (!auth.ok) return { success: false, error: auth.error };

    try {
        const templatesRes = await query(
            `SELECT *
             FROM shift_templates
             WHERE is_active = TRUE
               AND is_rest_day = FALSE
               AND (location_id = $1 OR location_id IS NULL)
             ORDER BY name ASC`,
            [locationId]
        );
        const templates = templatesRes.rows;

        if (templates.length === 0) {
            return { success: false, error: 'No hay plantillas activas para generar borrador' };
        }

        const weekEnd = addDaysToDateString(weekStart, 7);

        const availableStaffRes = await query(
            `SELECT u.id, u.name, u.role
             FROM users u
             WHERE u.is_active = true
               AND (u.assigned_location_id = $3 OR u.assigned_location_id IS NULL)
               AND NOT EXISTS (
                   SELECT 1
                   FROM time_off_requests t
                   WHERE t.user_id = u.id
                     AND t.status = 'APPROVED'
                     AND (t.start_date <= $2::date AND t.end_date >= $1::date)
               )
             ORDER BY u.role, u.name`,
            [weekStart, weekEnd, locationId]
        );

        const staff = availableStaffRes.rows;
        if (staff.length === 0) {
            return { success: false, error: 'No hay personal disponible para esa semana' };
        }

        const newShifts: Array<{
            user_id: string;
            location_id: string;
            start_at: string;
            end_at: string;
            status: 'draft';
            shift_template_id: string;
            is_overtime: boolean;
        }> = [];

        for (let i = 0; i < 7; i++) {
            const dateStr = addDaysToDateString(weekStart, i);
            const dailyStaff = [...staff].sort(() => 0.5 - Math.random());
            let staffIndex = 0;

            for (const tmpl of templates) {
                if (staffIndex >= dailyStaff.length) break;

                const startDateTime = new Date(`${dateStr}T${String(tmpl.start_time).slice(0, 8)}`);
                const endDateTime = new Date(`${dateStr}T${String(tmpl.end_time).slice(0, 8)}`);

                if (endDateTime <= startDateTime) {
                    endDateTime.setDate(endDateTime.getDate() + 1);
                }

                const employee = dailyStaff[staffIndex];
                newShifts.push({
                    user_id: employee.id,
                    location_id: locationId,
                    start_at: startDateTime.toISOString(),
                    end_at: endDateTime.toISOString(),
                    status: 'draft',
                    shift_template_id: tmpl.id,
                    is_overtime: false,
                });
                staffIndex++;
            }
        }

        if (newShifts.length === 0) {
            return { success: true, count: 0, message: 'No se generaron turnos' };
        }

        const insertResult = await query(
            `INSERT INTO employee_shifts (user_id, location_id, start_at, end_at, status, shift_template_id, is_overtime)
             SELECT
                 x.user_id,
                 x.location_id,
                 (x.start_at)::timestamptz,
                 (x.end_at)::timestamptz,
                 x.status,
                 x.shift_template_id,
                 x.is_overtime
             FROM json_to_recordset($1) AS x(
                 user_id text,
                 location_id uuid,
                 start_at text,
                 end_at text,
                 status text,
                 shift_template_id uuid,
                 is_overtime boolean
             )
             WHERE NOT EXISTS (
                 SELECT 1
                 FROM employee_shifts existing
                 WHERE existing.user_id = x.user_id
                   AND existing.location_id = x.location_id
                   AND existing.start_at = (x.start_at)::timestamptz
             )`,
            [JSON.stringify(newShifts)]
        );

        revalidatePath('/rrhh/horarios');
        return { success: true, count: insertResult.rowCount || 0 };
    } catch (error) {
        logger.error({ error, locationId, weekStart }, '[Scheduler] generateDraftScheduleV2 failed');
        return { success: false, error: 'No fue posible generar el borrador' };
    }
}

export async function getScheduleData(locationId: string, weekStart: string, weekEnd: string) {
    const inputValid = UUIDSchema.safeParse(locationId).success
        && DateOnlySchema.safeParse(weekStart).success
        && DateOnlySchema.safeParse(weekEnd).success;

    if (!inputValid) {
        return { shifts: [], templates: [], timeOffs: [] };
    }

    const auth = await authorizeScheduler(locationId);
    if (!auth.ok) {
        logger.warn({ locationId, weekStart, weekEnd }, `[Scheduler] getScheduleData denied: ${auth.error}`);
        return { shifts: [], templates: [], timeOffs: [] };
    }

    const shiftsRes = await query(
        `SELECT
            s.*,
            u.name as user_name,
            u.role as user_role,
            st.color as template_color,
            st.name as template_name
         FROM employee_shifts s
         JOIN users u ON s.user_id = u.id
         LEFT JOIN shift_templates st ON st.id = s.shift_template_id
         WHERE s.location_id = $1
           AND s.start_at >= $2::date
           AND s.start_at < ($3::date + INTERVAL '1 day')
         ORDER BY s.start_at ASC`,
        [locationId, weekStart, weekEnd]
    );

    const templatesRes = await query(
        `SELECT *
         FROM shift_templates
         WHERE is_active = TRUE
           AND (location_id = $1 OR location_id IS NULL)
         ORDER BY name ASC`,
        [locationId]
    );

    const timeOffRes = await query(
        `SELECT t.*, u.name as user_name
         FROM time_off_requests t
         JOIN users u ON t.user_id = u.id
         WHERE t.status = 'APPROVED'
           AND (u.assigned_location_id = $3 OR u.assigned_location_id IS NULL)
           AND (t.start_date <= $2::date AND t.end_date >= $1::date)
         ORDER BY t.start_date ASC`,
        [weekStart, weekEnd, locationId]
    );

    return {
        shifts: shiftsRes.rows,
        templates: templatesRes.rows,
        timeOffs: timeOffRes.rows,
    };
}

export async function getStaff(locationId: string) {
    if (!UUIDSchema.safeParse(locationId).success) return [];

    const auth = await authorizeScheduler(locationId);
    if (!auth.ok) return [];

    const res = await query(
        `SELECT id, name, role, assigned_location_id
         FROM users
         WHERE is_active = true
           AND (assigned_location_id = $1 OR assigned_location_id IS NULL)
         ORDER BY role, name`,
        [locationId]
    );
    return res.rows;
}

export async function publishScheduleV2(locationId: string, weekStart: string) {
    if (!UUIDSchema.safeParse(locationId).success || !DateOnlySchema.safeParse(weekStart).success) {
        return { success: false, error: 'Parámetros inválidos' };
    }

    const auth = await authorizeScheduler(locationId);
    if (!auth.ok) return { success: false, error: auth.error };

    try {
        const weekEnd = addDaysToDateString(weekStart, 7);

        const result = await query(
            `UPDATE employee_shifts
             SET status = 'published', updated_at = NOW()
             WHERE location_id = $1
               AND start_at >= $2::date
               AND start_at < $3::date
               AND status = 'draft'`,
            [locationId, weekStart, weekEnd]
        );

        revalidatePath('/rrhh/horarios');
        return { success: true, count: result.rowCount || 0 };
    } catch (error) {
        logger.error({ error, locationId, weekStart }, '[Scheduler] publishScheduleV2 failed');
        return { success: false, error: 'Error al publicar horario' };
    }
}

export async function deleteTimeOff(id: string) {
    if (!UUIDSchema.safeParse(id).success) {
        return { success: false, error: 'ID de ausencia inválido' };
    }

    try {
        const res = await query(
            `SELECT t.id, u.assigned_location_id
             FROM time_off_requests t
             JOIN users u ON u.id = t.user_id
             WHERE t.id = $1
             LIMIT 1`,
            [id]
        );

        if (res.rows.length === 0) {
            return { success: false, error: 'Ausencia no encontrada' };
        }

        const auth = await authorizeScheduler(res.rows[0]?.assigned_location_id || undefined);
        if (!auth.ok) return { success: false, error: auth.error };

        await query('DELETE FROM time_off_requests WHERE id = $1', [id]);
        revalidatePath('/rrhh/horarios');
        return { success: true };
    } catch (error) {
        logger.error({ error, id }, '[Scheduler] deleteTimeOff failed');
        return { success: false, error: 'Error al eliminar ausencia' };
    }
}

export async function getWeeklyHoursSummary(locationId: string, weekStart: string) {
    if (!UUIDSchema.safeParse(locationId).success || !DateOnlySchema.safeParse(weekStart).success) {
        return [];
    }

    const auth = await authorizeScheduler(locationId);
    if (!auth.ok) return [];

    const weekEnd = addDaysToDateString(weekStart, 7);

    const res = await query(
        `SELECT
            s.user_id,
            u.name as user_name,
            COALESCE(SUM(EXTRACT(EPOCH FROM (s.end_at - s.start_at)) / 3600), 0) as total_hours,
            COUNT(s.id) as shift_count,
            sc.weekly_hours as contract_hours
         FROM employee_shifts s
         JOIN users u ON s.user_id = u.id
         LEFT JOIN staff_contracts sc ON sc.user_id = s.user_id
         WHERE s.location_id = $1
           AND s.start_at >= $2::date
           AND s.start_at < $3::date
         GROUP BY s.user_id, u.name, sc.weekly_hours
         ORDER BY u.name`,
        [locationId, weekStart, weekEnd]
    );

    return res.rows.map((r: any) => {
        const totalHours = Number.parseFloat(r.total_hours || 0);
        const contractHours = Number(r.contract_hours || 45);
        return {
            userId: r.user_id,
            userName: r.user_name,
            totalHours,
            shiftCount: Number.parseInt(r.shift_count, 10),
            contractHours,
            isOvertime: totalHours > contractHours,
        };
    });
}

export async function copyPreviousWeek(locationId: string, targetWeekStart: string) {
    if (!UUIDSchema.safeParse(locationId).success || !DateOnlySchema.safeParse(targetWeekStart).success) {
        return { success: false, error: 'Parámetros inválidos' };
    }

    const auth = await authorizeScheduler(locationId);
    if (!auth.ok) return { success: false, error: auth.error };

    try {
        const prevStart = addDaysToDateString(targetWeekStart, -7);
        const prevEnd = addDaysToDateString(prevStart, 7);

        const prevShifts = await query(
            `SELECT user_id, location_id, start_at, end_at, shift_template_id, notes, is_overtime
             FROM employee_shifts
             WHERE location_id = $1
               AND start_at >= $2::date
               AND start_at < $3::date
               AND status = 'published'`,
            [locationId, prevStart, prevEnd]
        );

        if (prevShifts.rows.length === 0) {
            return { success: false, error: 'No hay turnos publicados en la semana anterior' };
        }

        const newShifts = prevShifts.rows.map((s: any) => {
            const newStart = new Date(s.start_at);
            newStart.setDate(newStart.getDate() + 7);
            const newEnd = new Date(s.end_at);
            newEnd.setDate(newEnd.getDate() + 7);

            return {
                user_id: s.user_id,
                location_id: s.location_id,
                start_at: newStart.toISOString(),
                end_at: newEnd.toISOString(),
                status: 'draft',
                shift_template_id: s.shift_template_id,
                is_overtime: s.is_overtime || false,
            };
        });

        const insertResult = await query(
            `INSERT INTO employee_shifts (user_id, location_id, start_at, end_at, status, shift_template_id, is_overtime)
             SELECT
                x.user_id,
                x.location_id,
                (x.start_at)::timestamptz,
                (x.end_at)::timestamptz,
                x.status,
                x.shift_template_id,
                x.is_overtime
             FROM json_to_recordset($1) AS x(
                user_id text,
                location_id uuid,
                start_at text,
                end_at text,
                status text,
                shift_template_id uuid,
                is_overtime boolean
             )
             WHERE NOT EXISTS (
                SELECT 1 FROM employee_shifts existing
                WHERE existing.user_id = x.user_id
                  AND existing.location_id = x.location_id
                  AND existing.start_at = (x.start_at)::timestamptz
             )`,
            [JSON.stringify(newShifts)]
        );

        revalidatePath('/rrhh/horarios');
        return { success: true, count: insertResult.rowCount || 0 };
    } catch (error) {
        logger.error({ error, locationId, targetWeekStart }, '[Scheduler] copyPreviousWeek failed');
        return { success: false, error: 'Error al copiar semana anterior' };
    }
}
