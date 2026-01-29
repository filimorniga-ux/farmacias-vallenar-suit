import { Suspense } from 'react';
import { getScheduleData } from '@/actions/scheduler-v2';
import { SchedulerContainer } from '@/presentation/components/scheduler/SchedulerContainer';
import { startOfWeek, parseISO } from 'date-fns';
import { pool } from '@/lib/db';

async function getStaff(locationId: string) {
    const res = await pool.query("SELECT id, name, role FROM users WHERE status = 'ACTIVE' ORDER BY role, name");
    return res.rows;
}

export default async function SchedulerPage({
    searchParams,
}: {
    searchParams: Promise<{ date?: string; location?: string }>
}) {
    const params = await searchParams;
    // 1. Determine Week/Month Start based on URL or Today
    const currentDate = params.date ? parseISO(params.date) : new Date();

    // Always load enough data for Month View (to be safe)
    // Load 35 days starting from the relevant Monday
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
    const queryStart = new Date(weekStart);
    queryStart.setDate(queryStart.getDate() - 7); // Buffer
    const queryStartStr = queryStart.toISOString().split('T')[0];

    const queryEnd = new Date(weekStart);
    queryEnd.setDate(queryEnd.getDate() + 42); // 6 weeks buffer
    const queryEndStr = queryEnd.toISOString().split('T')[0];

    // 2. Determine Location ID (Default to first active location if missing)
    let locationId = params.location;
    if (!locationId) {
        const locationRes = await pool.query("SELECT id FROM locations WHERE status = 'ACTIVE' LIMIT 1");
        locationId = locationRes.rows[0]?.id; // Fallback to undefined if no locations
    }

    if (!locationId) {
        return <div className="p-10 text-center">No hay sucursales activas configuradas.</div>;
    }

    // Parallel Fetching
    const [scheduleData, staff] = await Promise.all([
        getScheduleData(locationId, queryStartStr, queryEndStr),
        getStaff(locationId)
    ]);

    return (
        <div className="h-full bg-slate-50">
            <SchedulerContainer
                initialShifts={scheduleData.shifts}
                templates={scheduleData.templates}
                timeOffs={scheduleData.timeOffs}
                staff={staff}
                locationId={locationId}
                weekStart={weekStart} // This drives the UI "Current Date"
            />
        </div>
    );
}
