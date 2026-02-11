import { getScheduleData, getStaff, getWeeklyHoursSummary } from '@/actions/scheduler-v2';
import { SchedulerContainer } from '@/presentation/components/scheduler/SchedulerContainer';
import { startOfWeek, parseISO, format } from 'date-fns';
import { pool } from '@/lib/db';

export default async function SchedulerPage({
    searchParams,
}: {
    searchParams: Promise<{ date?: string; location?: string }>
}) {
    const params = await searchParams;
    const currentDate = params.date ? parseISO(params.date) : new Date();

    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const queryStart = new Date(weekStart);
    queryStart.setDate(queryStart.getDate() - 7);
    const queryStartStr = format(queryStart, 'yyyy-MM-dd');

    const queryEnd = new Date(weekStart);
    queryEnd.setDate(queryEnd.getDate() + 42);
    const queryEndStr = format(queryEnd, 'yyyy-MM-dd');

    // Determine Location ID
    let locationId = params.location;
    if (!locationId) {
        const locationRes = await pool.query("SELECT id FROM locations WHERE is_active = true LIMIT 1");
        locationId = locationRes.rows[0]?.id;
    }

    if (!locationId) {
        return <div className="p-10 text-center">No hay sucursales activas configuradas.</div>;
    }

    const weekStartStr = format(weekStart, 'yyyy-MM-dd');

    // Parallel Fetching using corrected server actions
    const [scheduleData, staff, hoursSummary] = await Promise.all([
        getScheduleData(locationId, queryStartStr, queryEndStr),
        getStaff(locationId),
        getWeeklyHoursSummary(locationId, weekStartStr)
    ]);

    return (
        <div className="h-full bg-slate-50">
            <SchedulerContainer
                initialShifts={scheduleData.shifts}
                templates={scheduleData.templates}
                timeOffs={scheduleData.timeOffs}
                staff={staff}
                hoursSummary={hoursSummary}
                locationId={locationId}
                weekStart={weekStart}
            />
        </div>
    );
}
