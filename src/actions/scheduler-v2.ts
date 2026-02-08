'use server';

/**
 * ============================================================================
 * SCHEDULER-V2: Gestor de Horario Laboral
 * Pharma-Synapse v3.3
 * ============================================================================
 * Filosofía: "Control Manual Total + Asistencia Inteligente"
 * - Permite solapamientos y horas extra (Zero Blocking)
 * - Turnos nocturnos soportados vía Timestamp
 */

import { pool, query } from '@/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

// ============================================================================
// SCHEMAS
// ============================================================================

const ShiftSchema = z.object({
    id: z.string().uuid().optional(),
    userId: z.string().uuid(),
    locationId: z.string().uuid(),
    startAt: z.string().datetime(), // ISO String
    endAt: z.string().datetime(),   // ISO String
    assignedBy: z.string().uuid().optional(), // Inferred from session if not provided
    notes: z.string().optional(),
});

const GenerateSchema = z.object({
    locationId: z.string().uuid(),
    weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD"), // Monday of the week
});

const TemplateSchema = z.object({
    name: z.string().min(1, "Name is required"),
    start: z.string().regex(/^\d{2}:\d{2}$/, "Format HH:MM").optional(), // Optional if rest day
    end: z.string().regex(/^\d{2}:\d{2}$/, "Format HH:MM").optional(),   // Optional if rest day
    color: z.string().regex(/^#/, "Must be a hex color"),
    locationId: z.string().uuid().optional().nullable(),
    breakMinutes: z.number().int().min(0).default(0),
    isRestDay: z.boolean().default(false),
    // Optional exact break times
    breakStart: z.string().regex(/^\d{2}:\d{2}$/, "Format HH:MM").optional(),
    breakEnd: z.string().regex(/^\d{2}:\d{2}$/, "Format HH:MM").optional(),
}).refine(data => {
    if (!data.isRestDay) {
        return !!data.start && !!data.end;
    }
    return true;
}, {
    message: "Start and End time are required for work days",
    path: ["start"],
});

// ... (TimeOffSchema omitted)

/**
 * Crear nueva plantilla de turno
 */
export async function createShiftTemplate(data: z.infer<typeof TemplateSchema>) {
    const parsed = TemplateSchema.safeParse(data);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0].message };
    }

    const { name, start, end, color, locationId, breakMinutes, isRestDay, breakStart, breakEnd } = parsed.data;

    try {
        await query(`
            INSERT INTO shift_templates (name, start_time, end_time, color, location_id, is_active, break_minutes, is_rest_day, break_start_time, break_end_time)
            VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9)
        `, [
            name,
            start || '00:00', // Default if rest day
            end || '00:00',   // Default if rest day
            color,
            locationId || null,
            breakMinutes,
            isRestDay,
            breakStart || null,
            breakEnd || null
        ]);

        revalidatePath('/rrhh/horarios');
        return { success: true };
    } catch (error) {
        console.error('Error creating template:', error);
        return { success: false, error: 'Failed to create template' };
    }
}

/**
 * Eliminar plantilla de turno (Soft delete o hard delete)
 * Hard delete por ahora si no está usada, o cascade? Migration tiene CASCADE en FK? 
 * employee_shifts.shift_template_id tiene ON DELETE SET NULL.
 */
export async function deleteShiftTemplate(id: string) {
    try {
        // Podríamos hacer soft delete (is_active = false) pero el usuario pidió "manage templates".
        // Vamos a hacer Hard Delete ya que shift_template_id es opcional en employee_shifts.
        await query('DELETE FROM shift_templates WHERE id = $1', [id]);
        revalidatePath('/rrhh/horarios');
        return { success: true };
    } catch (error) {
        console.error('Error deleting template:', error);
        return { success: false, error: 'Failed to delete template' };
    }
}


// ============================================================================
// TIME OFF MANAGEMENT
// ============================================================================

const TimeOffSchema = z.object({
    id: z.string().uuid().optional(),
    userId: z.string().uuid(),
    type: z.enum(['VACATION', 'SICK_LEAVE', 'PERSONAL', 'FAMILY_EMERGENCY', 'OTHER']),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD"),
    notes: z.string().optional(),
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('APPROVED'),
});

/**
 * Registrar o Actualizar Ausencia (Vacaciones, Licencias)
 */
export async function upsertTimeOffRequest(data: z.infer<typeof TimeOffSchema>) {
    const parsed = TimeOffSchema.safeParse(data);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0].message };
    }

    const { id, userId, type, startDate, endDate, notes, status } = parsed.data;

    try {
        if (id) {
            // Update
            await query(`
                UPDATE time_off_requests 
                SET type = $2, start_date = $3, end_date = $4, notes = $5, status = $6, updated_at = NOW()
                WHERE id = $1
            `, [id, type, startDate, endDate, notes, status]);
        } else {
            // Insert
            await query(`
                INSERT INTO time_off_requests (user_id, type, start_date, end_date, notes, status)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [userId, type, startDate, endDate, notes, status]);
        }

        revalidatePath('/rrhh/horarios');
        return { success: true };
    } catch (error) {
        console.error('Error upserting time off:', error);
        return { success: false, error: 'Failed to save time off request' };
    }
}

/**
 * Crear o Actualizar un Turno (Control Manual)
 * - Calcula is_overtime automáticamente
 * - NO bloquea si hay solapamiento o vacaciones (solo advertencias visuales en UI)
 */
export async function upsertShiftV2(data: z.infer<typeof ShiftSchema>) {
    const parsed = ShiftSchema.safeParse(data);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0].message };
    }

    const { id, userId, locationId, startAt, endAt, assignedBy, notes } = parsed.data;

    // Calcular duración en horas
    const start = new Date(startAt);
    const end = new Date(endAt);
    const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

    // Obtener contrato para flag de overtime (Lógica simplificada por ahora: > 9h diarias es overtime visual)
    // En el futuro, esto debería sumar las horas de la semana.
    // Consulta rápida de contrato (si no existe, por defecto 45h semanales / 9h diarias)
    const contractRes = await query('SELECT weekly_hours FROM staff_contracts WHERE user_id = $1', [userId]);
    const weeklyInfo = contractRes.rows[0]?.weekly_hours || 45;
    const isOvertime = durationHours > (weeklyInfo / 5); // Heurística simple: si dura más que el promedio diario

    try {
        if (id) {
            // Update
            await query(`
                UPDATE employee_shifts 
                SET start_at = $1, end_at = $2, location_id = $3, user_id = $4, 
                    is_overtime = $5, notes = $6, updated_at = NOW(), status = 'published'
                WHERE id = $7
            `, [startAt, endAt, locationId, userId, isOvertime, notes, id]);
        } else {
            // Insert
            await query(`
                INSERT INTO employee_shifts (user_id, location_id, start_at, end_at, assigned_by, status, is_overtime, notes)
                VALUES ($1, $2, $3, $4, $5, 'published', $6, $7)
            `, [userId, locationId, startAt, endAt, assignedBy, isOvertime, notes]);
        }

        revalidatePath('/rrhh/horarios');
        return { success: true };
    } catch (error) {
        console.error('Error in upsertShiftV2:', error);
        return { success: false, error: 'Database error' };
    }
}

/**
 * Eliminar turno
 */
export async function deleteShiftV2(shiftId: string) {
    try {
        await query('DELETE FROM employee_shifts WHERE id = $1', [shiftId]);
        revalidatePath('/rrhh/horarios');
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Delete failed' };
    }
}

/**
 * Generar Borrador Inteligente (AI Draft)
 * - Rellena huecos basándose en Templates activos
 * - Evita empleados con Time Off
 */
export async function generateDraftScheduleV2(data: z.infer<typeof GenerateSchema>) {
    const { locationId, weekStart } = data;

    // 1. Obtener Templates Activos para esta Location (o globales)
    const templatesRes = await query(`
        SELECT * FROM shift_templates 
        WHERE is_active = TRUE AND (location_id = $1 OR location_id IS NULL)
    `, [locationId]);
    const templates = templatesRes.rows;

    if (templates.length === 0) return { success: false, error: 'No templates defined' };

    // 2. Obtener Empleados elegibles (sin Time Off en esa semana)
    // Simplificación: Traemos todos y filtramos en código o consulta compleja
    // Aquí haremos una consulta de empleados disponibles
    const weekStartObj = new Date(weekStart);
    const weekEndObj = new Date(weekStartObj);
    weekEndObj.setDate(weekStartObj.getDate() + 7);

    const availableStaffRes = await query(`
        SELECT u.id, u.name, u.role 
        FROM users u 
        WHERE u.status = 'ACTIVE' 
        AND NOT EXISTS (
            SELECT 1 FROM time_off_requests t 
            WHERE t.user_id = u.id 
            AND t.status = 'APPROVED'
            AND (t.start_date <= $2 AND t.end_date >= $1)
        )
    `, [weekStart, weekEndObj.toISOString().split('T')[0]]);
    const staff = availableStaffRes.rows;

    if (staff.length === 0) return { success: false, error: 'No staff available' };

    // 3. Algoritmo Voraz Simple ("Greedy")
    // Para cada día de la semana, intentar llenar los templates con staff aleatorio del rol adecuado
    // (Asumiremos que cualquier staff puede hacer cualquier template por ahora, o filtrar por rol si tuviéramos esa info)

    const newShifts = [];

    for (let i = 0; i < 7; i++) { // Lunes a Domingo
        const currentDay = new Date(weekStartObj);
        currentDay.setDate(currentDay.getDate() + i);
        const dateStr = currentDay.toISOString().split('T')[0];

        // Mezclar staff para aleatoriedad
        const dailyStaff = [...staff].sort(() => 0.5 - Math.random());
        let staffIndex = 0;

        for (const tmpl of templates) {
            if (staffIndex >= dailyStaff.length) break; // Sin gente suficiente

            // Construir Timestamps (Manejo de cruce de día)
            // tmpl.start_time es "HH:MM:SS"
            const startDateTime = new Date(`${dateStr}T${tmpl.start_time}`);
            const endDateTime = new Date(`${dateStr}T${tmpl.end_time}`);

            if (endDateTime <= startDateTime) {
                // Cruza medianoche (ej: 22:00 -> 06:00)
                endDateTime.setDate(endDateTime.getDate() + 1);
            }

            // Verificar si ya tiene turno ese día (Omitir doble turno en draft)
            // (Para MVP, simple round robin)

            const employee = dailyStaff[staffIndex];

            newShifts.push({
                user_id: employee.id,
                location_id: locationId,
                start_at: startDateTime.toISOString(),
                end_at: endDateTime.toISOString(),
                status: 'draft',
                shift_template_id: tmpl.id,
                is_overtime: false
            });

            staffIndex++;
        }
    }

    // 4. Batch Insert
    if (newShifts.length > 0) {
        // Generar placeholders ($1, $2, ...), ($8, $9, ...)
        // Esto es tedioso en pg puro sin ORM para batch grande.
        // Haremos un loop serial por simplicidad del MVP o JSON insert.
        // JSON insert es más eficiente en PG.

        try {
            await query(`
                INSERT INTO employee_shifts (user_id, location_id, start_at, end_at, status, shift_template_id, is_overtime)
                SELECT 
                    x.user_id, x.location_id, (x.start_at)::timestamp with time zone, (x.end_at)::timestamp with time zone, 
                    x.status, x.shift_template_id, x.is_overtime
                FROM json_to_recordset($1) AS x(
                    user_id text, location_id uuid, start_at text, end_at text, 
                    status text, shift_template_id uuid, is_overtime boolean
                )
                WHERE NOT EXISTS (
                    -- Evitar duplicados exactos si se corre 2 veces
                    SELECT 1 FROM employee_shifts existing 
                    WHERE existing.user_id = x.user_id 
                    AND existing.start_at = (x.start_at)::timestamp with time zone
                )
            `, [JSON.stringify(newShifts)]);

            revalidatePath('/rrhh/horarios');
            return { success: true, count: newShifts.length };
        } catch (e) {
            console.error('Batch insert failed', e);
            return { success: false, error: 'Draft generation failed' };
        }
    }

    return { success: true, count: 0, message: 'No shifts generated' };
}

// ============================================================================
// DATA FETCHING (Server Side)
// ============================================================================

export async function getScheduleData(locationId: string, weekStart: string, weekEnd: string) {
    const shiftsRes = await query(`
        SELECT s.*, u.name as user_name, u.role as user_role 
        FROM employee_shifts s
        JOIN users u ON s.user_id = u.id
        WHERE s.location_id = $1 
        AND s.start_at >= $2 AND s.start_at <= $3
    `, [locationId, weekStart, weekEnd]);

    const templatesRes = await query(`SELECT * FROM shift_templates WHERE is_active = TRUE AND (location_id = $1 OR location_id IS NULL)`, [locationId]);

    // Time Offs para visualización "Warning"
    const timeOffRes = await query(`
        SELECT t.*, u.name as user_name 
        FROM time_off_requests t
        JOIN users u ON t.user_id = u.id
        WHERE t.status = 'APPROVED' 
        AND (t.start_date <= $2 AND t.end_date >= $1)
    `, [weekStart, weekEnd]);

    return {
        shifts: shiftsRes.rows,
        templates: templatesRes.rows,
        timeOffs: timeOffRes.rows
    };
}

export async function getStaff(locationId: string) {
    // Validar si locationId es necesario o traemos todos. Por ahora traemos todos los activos.
    // Filtrar por location si existiera users.location_id
    const res = await query("SELECT id, name, role FROM users WHERE status = 'ACTIVE' ORDER BY role, name");
    return res.rows;
}
