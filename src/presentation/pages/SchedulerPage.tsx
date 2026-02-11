'use client';

import React, { useState, useEffect } from 'react';
import { startOfWeek, format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { getScheduleData, getStaff, getWeeklyHoursSummary } from '@/actions/scheduler-v2';
import { SchedulerContainer } from '@/presentation/components/scheduler/SchedulerContainer';
import { usePharmaStore } from '@/presentation/store/useStore';

export default function SchedulerPage() {
    const currentLocationId = usePharmaStore(s => s.currentLocationId);
    const locations = usePharmaStore(s => s.locations);
    const currentLocationName = locations.find(l => l.id === currentLocationId)?.name || 'Todas las sucursales';

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<{
        shifts: any[];
        templates: any[];
        timeOffs: any[];
        staff: any[];
        hoursSummary: any[];
    } | null>(null);

    const now = new Date();
    const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(now, { weekStartsOn: 1 }));

    const locationId = currentLocationId || '00000000-0000-0000-0000-000000000000';

    useEffect(() => {
        let isMounted = true;

        async function fetchData() {
            setLoading(true);
            try {
                const weekStartStr = format(currentWeekStart, 'yyyy-MM-dd');
                const weekEnd = new Date(currentWeekStart);
                weekEnd.setDate(weekEnd.getDate() + 7);
                const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

                const [scheduleData, staffData, hoursSummary] = await Promise.all([
                    getScheduleData(locationId, weekStartStr, weekEndStr),
                    getStaff(locationId),
                    getWeeklyHoursSummary(locationId, weekStartStr)
                ]);

                if (isMounted) {
                    setData({
                        shifts: scheduleData.shifts,
                        templates: scheduleData.templates,
                        timeOffs: scheduleData.timeOffs,
                        staff: staffData,
                        hoursSummary
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
        <div className="h-dvh bg-slate-50 flex flex-col pb-safe">
            <div className="flex-none p-4 pb-0">
                <h1 className="text-2xl font-bold text-slate-800">Gestor de Horarios</h1>
                <p className="text-sm text-slate-500">
                    Planificación semanal de turnos — {currentLocationName}
                </p>
            </div>

            <div className="flex-1 overflow-hidden">
                <SchedulerContainer
                    initialShifts={data.shifts}
                    templates={data.templates}
                    timeOffs={data.timeOffs}
                    staff={data.staff}
                    hoursSummary={data.hoursSummary}
                    locationId={locationId}
                    weekStart={currentWeekStart}
                />
            </div>
        </div>
    );
}
