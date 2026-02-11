'use client';

import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';

const TIMEZONE = 'America/Santiago';

function formatTime(isoString: string): string {
    return new Intl.DateTimeFormat('es-CL', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: TIMEZONE
    }).format(new Date(isoString));
}

interface ShiftCardProps {
    shift: any;
    isOverlay?: boolean;
    onClick?: () => void;
}

export function ShiftCard({ shift, isOverlay, onClick }: ShiftCardProps) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `shift-${shift.id}`,
        data: { type: 'SHIFT', shift },
        disabled: isOverlay,
    });

    const style = transform && !isOverlay ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    } : undefined;

    const startHour = parseInt(formatTime(shift.start_at).split(':')[0]);
    const isNightShift = startHour >= 20 || startHour < 6;
    const isDraft = shift.status === 'draft';

    // Calculate duration
    const durationHours = (new Date(shift.end_at).getTime() - new Date(shift.start_at).getTime()) / (1000 * 60 * 60);

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            onClick={onClick}
            title={`${formatTime(shift.start_at)} - ${formatTime(shift.end_at)} (${durationHours.toFixed(1)}h)${shift.notes ? '\n' + shift.notes : ''}`}
            className={cn(
                "text-xs rounded-md cursor-grab active:cursor-grabbing transition-all",
                "border shadow-sm hover:shadow-md hover:scale-[1.02]",
                isDragging && !isOverlay && "opacity-30",
                isOverlay && "shadow-xl ring-2 ring-primary",
                // Color based on status
                isDraft
                    ? "bg-amber-50 border-amber-300 text-amber-900 border-dashed"
                    : isNightShift
                        ? "bg-indigo-100 border-indigo-300 text-indigo-900"
                        : "bg-white border-slate-200 text-slate-800",
            )}
        >
            {/* Color bar top */}
            <div
                className="h-1 rounded-t-md"
                style={{ backgroundColor: shift.template_color || (isNightShift ? '#6366f1' : '#3b82f6') }}
            />

            <div className="px-1.5 py-1">
                {/* Time */}
                <div className="font-semibold leading-tight flex items-center gap-1">
                    {formatTime(shift.start_at)} - {formatTime(shift.end_at)}
                    {shift.is_overtime && (
                        <span className="text-[9px] bg-red-100 text-red-600 px-0.5 rounded font-bold">+OT</span>
                    )}
                </div>

                {/* Duration + Status */}
                <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">{durationHours.toFixed(1)}h</span>
                    {isDraft && (
                        <span className="text-[9px] bg-amber-200 text-amber-800 px-1 rounded font-medium">BORRADOR</span>
                    )}
                    {isNightShift && (
                        <span className="text-[9px]">🌙</span>
                    )}
                </div>

                {/* Notes */}
                {shift.notes && (
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5 italic">
                        {shift.notes}
                    </div>
                )}
            </div>
        </div>
    );
}
