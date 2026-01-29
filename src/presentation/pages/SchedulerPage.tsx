'use client';

import React, { useState, useEffect } from 'react';
import { startOfWeek } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { getScheduleData, getStaff } from '@/actions/scheduler-v2';
import { SchedulerContainer } from '@/presentation/components/scheduler/SchedulerContainer';

export default function SchedulerPage() {
    // State for data
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<{
        shifts: any[];
        templates: any[];
        timeOffs: any[];
        staff: any[];
    } | null>(null);

    // State for filters (lifted up or just initial)
    // Default to current week
    const now = new Date();
    // Monday start
    const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(now, { weekStartsOn: 1 }));
    // Default location (could come from store)
    const [locationId, setLocationId] = useState('00000000-0000-0000-0000-000000000000'); // Fallback

    useEffect(() => {
        let isMounted = true;

        async function fetchData() {
            setLoading(true);
            try {
                const weekStartStr = currentWeekStart.toISOString().split('T')[0];
                const weekEnd = new Date(currentWeekStart);
                weekEnd.setDate(weekEnd.getDate() + 7);
                const weekEndStr = weekEnd.toISOString().split('T')[0];

                // Parallel fetch
                const [scheduleData, staffData] = await Promise.all([
                    getScheduleData(locationId, weekStartStr, weekEndStr),
                    getStaff(locationId)
                ]);

                if (isMounted) {
                    setData({
                        shifts: scheduleData.shifts,
                        templates: scheduleData.templates,
                        timeOffs: scheduleData.timeOffs,
                        staff: staffData
                    });
                }
            } catch (error) {
                console.error("Failed to fetch schedule data", error);
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        fetchData();

        return () => { isMounted = false; };
    }, [locationId, currentWeekStart]);

    if (loading || !data) {
        return (
            <div className="flex items-center justify-center h-full min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="h-full bg-slate-50 flex flex-col">
            <div className="flex-none p-4 pb-0">
                <h1 className="text-2xl font-bold text-slate-800">Gestor de Horarios</h1>
                <p className="text-sm text-slate-500">Planificación semanal de turnos</p>
            </div>

            <div className="flex-1 overflow-hidden">
                <SchedulerContainer
                    initialShifts={data.shifts}
                    templates={data.templates}
                    timeOffs={data.timeOffs}
                    staff={data.staff}
                    locationId={locationId}
                    weekStart={currentWeekStart}
                />
            </div>
        </div>
    );
}
