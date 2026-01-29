'use client';

import {
    startOfMonth,
    endOfMonth,
    eachDayOfInterval,
    format,
    isSameMonth,
    isSameDay,
    isToday
} from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface MonthlyGridProps {
    currentDate: Date; // A date within the month
    shifts: any[];
    timeOffs: any[];
}

export function MonthlyGrid({ currentDate, shifts, timeOffs }: MonthlyGridProps) {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);

    // Fill up calendar grid (start from Monday)
    const startDate = new Date(monthStart);
    // Adjust to previous Monday
    const dayOfWeek = startDate.getDay(); // 0 is Sunday
    const diff = startDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    startDate.setDate(diff);

    // End on Sunday
    const endDate = new Date(monthEnd);
    const endDayOfWeek = endDate.getDay();
    const endDiff = endDate.getDate() + (7 - endDayOfWeek);
    endDate.setDate(endDiff);

    // If start > end due to math (rare edge cases with month bounds), safety
    // Usually we just use eachDayOfInterval.

    // Better strategy: Simple generate 35 or 42 cells starting from adjusted start.
    const calendarDays = [];
    const iterDate = new Date(startDate);

    // Generar 6 semanas fijo para grilla estable
    for (let i = 0; i < 42; i++) {
        calendarDays.push(new Date(iterDate));
        iterDate.setDate(iterDate.getDate() + 1);
    }

    const getDayContent = (day: Date) => {
        const dateStr = day.toISOString().split('T')[0];
        // Filter shifts for this day
        const dayShifts = shifts.filter(s => s.start_at.startsWith(dateStr));

        // Filter time offs
        const dayTimeOffs = timeOffs.filter(t =>
            new Date(t.start_date) <= day && new Date(t.end_date) >= day
        );

        return { dayShifts, dayTimeOffs };
    };

    return (
        <div className="flex-1 bg-white flex flex-col h-full overflow-hidden">
            {/* Header Days */}
            <div className="grid grid-cols-7 border-b">
                {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
                    <div key={d} className="p-2 text-center text-sm font-semibold text-muted-foreground border-r last:border-r-0">
                        {d}
                    </div>
                ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-7 grid-rows-6 flex-1">
                {calendarDays.map((day, idx) => {
                    const { dayShifts, dayTimeOffs } = getDayContent(day);
                    const isCurrentMonth = isSameMonth(day, monthStart);

                    return (
                        <div
                            key={idx}
                            className={cn(
                                "border-b border-r p-1 flex flex-col gap-1 overflow-hidden min-h-[80px]",
                                !isCurrentMonth && "bg-slate-50 opacity-50 text-muted-foreground",
                                isToday(day) && "bg-blue-50/50"
                            )}
                        >
                            <div className={cn(
                                "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ml-auto",
                                isToday(day) ? "bg-primary text-white" : ""
                            )}>
                                {format(day, 'd')}
                            </div>

                            <div className="flex-1 space-y-1 overflow-y-auto custom-scrollbar">
                                {/* Time Off Indicators */}
                                {dayTimeOffs.map(t => (
                                    <div key={t.id} title={t.notes} className="text-[10px] bg-red-100 text-red-700 px-1 rounded truncate border border-red-200">
                                        🚫 {t.type}
                                    </div>
                                ))}

                                {/* Shift Indicators (Compact) */}
                                {dayShifts.map(s => (
                                    <div key={s.id} className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded truncate border border-blue-200">
                                        {s.user_name?.split(' ')[0]} ({s.start_at.slice(11, 16)})
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
