'use client';

import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { ShiftCard } from './ShiftCard';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface GridCellProps {
    day: string; // ISO Date String (YYYY-MM-DD)
    userId: string;
    shifts: any[];
    isOverThreshold?: boolean; // If weekly hours exceeded
    disabled?: boolean;
    onShiftClick?: (shift: any) => void;
}

function GridCell({ day, userId, shifts, disabled, onShiftClick }: GridCellProps) {
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
                isOver ? "bg-primary/10" : "bg-transparent hover:bg-slate-50",
                disabled && "opacity-50 pointer-events-none bg-slate-100"
            )}
        >
            <div className="space-y-1">
                {shifts.map(shift => (
                    <ShiftCard key={shift.id} shift={shift} onClick={() => onShiftClick?.(shift)} />
                ))}
            </div>

            {/* Quick Add Button on Hover (Empty Cell) */}
            {shifts.length === 0 && !disabled && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
                    <span className="text-[10px] text-muted-foreground/50">+</span>
                </div>
            )}
        </div>
    );
}

interface InteractiveGridProps {
    weekStart: Date; // Lunes de la semana
    staff: any[]; // List of employees
    shifts: any[]; // All shifts for the week
    timeOffs: any[]; // Approved time offs
    onShiftClick?: (shift: any) => void;
}

export function InteractiveGrid({ weekStart, staff, shifts, timeOffs, onShiftClick }: InteractiveGridProps) {
    // Generate 7 days array
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

    const isEmployeeOnTimeOff = (userId: string, date: Date) => {
        const dateTime = date.getTime();
        return timeOffs.some(t =>
            t.user_id === userId &&
            new Date(t.start_date).getTime() <= dateTime &&
            new Date(t.end_date).getTime() >= dateTime
        );
    };

    return (
        <div className="flex-1 overflow-auto bg-white">
            <div className="min-w-[1000px]"> {/* Horizontal Scroll Container */}

                {/* Header Row (Days) */}
                <div className="grid grid-cols-[200px_repeat(7,1fr)] sticky top-0 z-10 bg-white border-b shadow-sm">
                    <div className="p-3 font-bold text-sm border-r bg-slate-50 text-slate-500">
                        Equipo
                    </div>
                    {days.map((day, i) => (
                        <div key={i} className="p-3 text-center border-r last:border-r-0">
                            <div className="font-semibold text-sm capitalize">
                                {format(day, 'EEE', { locale: es })}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {format(day, 'd')}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Rows (Employees) */}
                <div className="divide-y">
                    {staff.map(employee => (
                        <div key={employee.id} className="grid grid-cols-[200px_repeat(7,1fr)]">
                            {/* Employee Header */}
                            <div className="p-3 border-r bg-slate-50/50 flex flex-col justify-center">
                                <div className="font-medium text-sm truncate">{employee.name}</div>
                                <div className="text-xs text-muted-foreground truncate capitalize">
                                    {employee.role?.replace(/_/g, ' ').toLowerCase()}
                                </div>
                            </div>

                            {/* Days Cells */}
                            {days.map((day, i) => {
                                const isOnTimeOff = isEmployeeOnTimeOff(employee.id, day);
                                const cellShifts = getShiftsForCell(employee.id, day);

                                return (
                                    <GridCell
                                        key={`${employee.id}-${format(day, 'yyyy-MM-dd')}`}
                                        day={format(day, 'yyyy-MM-dd')}
                                        userId={employee.id}
                                        shifts={cellShifts}
                                        disabled={isOnTimeOff} // Visual disable (can still drop if we want flexible rules, but let's visually gray it out)
                                        onShiftClick={onShiftClick}
                                    />
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
