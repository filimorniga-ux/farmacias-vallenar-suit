'use client';

import {
    startOfMonth,
    endOfMonth,
    format,
    isSameMonth,
    isToday
} from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const TIMEZONE = 'America/Santiago';

function formatTimeSantiago(isoString: string): string {
    return new Intl.DateTimeFormat('es-CL', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: TIMEZONE
    }).format(new Date(isoString));
}

interface MonthlyGridProps {
    currentDate: Date;
    shifts: any[];
    timeOffs: any[];
}

export function MonthlyGrid({ currentDate, shifts, timeOffs }: MonthlyGridProps) {
    const monthStart = startOfMonth(currentDate);

    // Adjust to previous Monday
    const startDate = new Date(monthStart);
    const dayOfWeek = startDate.getDay();
    const diff = startDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    startDate.setDate(diff);

    // Generate 42 cells (6 weeks)
    const calendarDays: Date[] = [];
    const iterDate = new Date(startDate);
    for (let i = 0; i < 42; i++) {
        calendarDays.push(new Date(iterDate));
        iterDate.setDate(iterDate.getDate() + 1);
    }

    const getDayContent = (day: Date) => {
        const dateStr = format(day, 'yyyy-MM-dd');

        // Filter shifts safely (handle both Date objects and ISO strings)
        const dayShifts = shifts.filter(s => {
            const startAt = typeof s.start_at === 'string' ? s.start_at : new Date(s.start_at).toISOString();
            return startAt.startsWith(dateStr);
        });

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
                                {dayTimeOffs.map((t: any) => (
                                    <div key={t.id} title={t.notes || t.reason} className="text-[10px] bg-red-100 text-red-700 px-1 rounded truncate border border-red-200">
                                        {t.type === 'VACATION' ? '🏖️' :
                                            t.type === 'SICK_LEAVE' ? '🏥' : '🚫'} {t.user_name?.split(' ')[0]}
                                    </div>
                                ))}

                                {/* Shift Indicators */}
                                {dayShifts.map((s: any) => (
                                    <div
                                        key={s.id}
                                        className={cn(
                                            "text-[10px] px-1 rounded truncate border",
                                            s.status === 'draft'
                                                ? "bg-amber-50 text-amber-700 border-amber-200 border-dashed"
                                                : "bg-blue-100 text-blue-700 border-blue-200"
                                        )}
                                    >
                                        {s.user_name?.split(' ')[0]} ({formatTimeSantiago(s.start_at)})
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
