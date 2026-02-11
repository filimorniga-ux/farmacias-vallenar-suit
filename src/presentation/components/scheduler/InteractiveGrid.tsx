'use client';

import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { ShiftCard } from './ShiftCard';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const TIMEZONE = 'America/Santiago';

interface GridCellProps {
    day: string;
    userId: string;
    shifts: any[];
    disabled?: boolean;
    timeOffType?: string;
    onShiftClick?: (shift: any) => void;
}

function GridCell({ day, userId, shifts, disabled, timeOffType, onShiftClick }: GridCellProps) {
    const { isOver, setNodeRef } = useDroppable({
        id: `cell-${userId}-${day}`,
        data: { type: 'CELL', day, userId },
        disabled
    });

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "min-h-[80px] border-b border-r p-1 transition-colors relative group",
                isOver ? "bg-primary/10 ring-2 ring-primary/30" : "bg-transparent hover:bg-slate-50",
                disabled && "bg-red-50/60 pointer-events-none"
            )}
        >
            {/* Time Off Indicator */}
            {disabled && timeOffType && (
                <div className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-sm mb-1 truncate border border-red-200">
                    {timeOffType === 'VACATION' ? '🏖️ Vacaciones' :
                        timeOffType === 'SICK_LEAVE' ? '🏥 Licencia' :
                            timeOffType === 'PERSONAL' ? '👤 Permiso' :
                                timeOffType === 'FAMILY_EMERGENCY' ? '🏠 Emergencia' :
                                    '🚫 Ausente'}
                </div>
            )}

            <div className="space-y-1">
                {shifts.map(shift => (
                    <ShiftCard key={shift.id} shift={shift} onClick={() => onShiftClick?.(shift)} />
                ))}
            </div>

            {/* Quick Add hint on hover */}
            {shifts.length === 0 && !disabled && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
                    <span className="text-lg text-muted-foreground/30 font-light">+</span>
                </div>
            )}
        </div>
    );
}

interface InteractiveGridProps {
    weekStart: Date;
    staff: any[];
    shifts: any[];
    timeOffs: any[];
    hoursSummary: any[];
    onShiftClick?: (shift: any) => void;
}

export function InteractiveGrid({ weekStart, staff, shifts, timeOffs, hoursSummary, onShiftClick }: InteractiveGridProps) {
    const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
    });

    const getShiftsForCell = (userId: string, date: Date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        return shifts.filter(s => {
            const shiftDate = new Date(s.start_at);
            const shiftDateStr = format(shiftDate, 'yyyy-MM-dd');
            return s.user_id === userId && shiftDateStr === dateStr;
        });
    };

    const getTimeOff = (userId: string, date: Date) => {
        const dateTime = date.getTime();
        return timeOffs.find(t =>
            t.user_id === userId &&
            new Date(t.start_date).getTime() <= dateTime &&
            new Date(t.end_date).getTime() >= dateTime
        );
    };

    const getHoursSummary = (userId: string) => {
        return hoursSummary.find(h => h.userId === userId);
    };

    return (
        <div className="flex-1 overflow-auto bg-white">
            <div className="min-w-[1000px]">

                {/* Header Row */}
                <div className="grid grid-cols-[220px_repeat(7,1fr)] sticky top-0 z-10 bg-white border-b shadow-sm">
                    <div className="p-3 font-bold text-sm border-r bg-slate-50 text-slate-500">
                        Equipo
                    </div>
                    {days.map((day, i) => {
                        const isToday = format(new Date(), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');
                        return (
                            <div key={i} className={cn(
                                "p-3 text-center border-r last:border-r-0",
                                isToday && "bg-blue-50"
                            )}>
                                <div className="font-semibold text-sm capitalize">
                                    {format(day, 'EEE', { locale: es })}
                                </div>
                                <div className={cn(
                                    "text-xs",
                                    isToday ? "bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center mx-auto font-bold" : "text-muted-foreground"
                                )}>
                                    {format(day, 'd')}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Rows */}
                <div className="divide-y">
                    {staff.map(employee => {
                        const hours = getHoursSummary(employee.id);
                        const contractHours = hours?.contractHours || 45;
                        const totalHours = hours?.totalHours || 0;
                        const hoursPercent = Math.min((totalHours / contractHours) * 100, 100);

                        return (
                            <div key={employee.id} className="grid grid-cols-[220px_repeat(7,1fr)]">
                                {/* Employee Header */}
                                <div className="p-3 border-r bg-slate-50/50 flex flex-col justify-center gap-1">
                                    <div className="font-medium text-sm truncate">{employee.name}</div>
                                    <div className="text-xs text-muted-foreground truncate capitalize">
                                        {employee.role?.replace(/_/g, ' ').toLowerCase()}
                                    </div>
                                    {/* Hours bar */}
                                    <div className="mt-1">
                                        <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                                            <span className={cn(
                                                "font-bold",
                                                hours?.isOvertime ? "text-red-600" : "text-slate-600"
                                            )}>
                                                {totalHours.toFixed(0)}h
                                            </span>
                                            <span>/{contractHours}h</span>
                                        </div>
                                        <div className="w-full bg-slate-200 rounded-full h-1.5">
                                            <div
                                                className={cn(
                                                    "h-1.5 rounded-full transition-all",
                                                    hours?.isOvertime ? "bg-red-500" :
                                                        hoursPercent > 80 ? "bg-amber-500" : "bg-green-500"
                                                )}
                                                style={{ width: `${Math.min(hoursPercent, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Day Cells */}
                                {days.map((day, i) => {
                                    const timeOff = getTimeOff(employee.id, day);
                                    const cellShifts = getShiftsForCell(employee.id, day);

                                    return (
                                        <GridCell
                                            key={`${employee.id}-${format(day, 'yyyy-MM-dd')}`}
                                            day={format(day, 'yyyy-MM-dd')}
                                            userId={employee.id}
                                            shifts={cellShifts}
                                            disabled={!!timeOff}
                                            timeOffType={timeOff?.type}
                                            onShiftClick={onShiftClick}
                                        />
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
