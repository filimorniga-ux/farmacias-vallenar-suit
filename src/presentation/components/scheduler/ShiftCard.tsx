'use client';

import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { Clock, AlertTriangle, Moon, CheckCircle2 } from 'lucide-react';

interface ShiftCardProps {
    shift: any; // Type 'any' for now, replace with proper interface later
    isOverlay?: boolean;
    onClick?: () => void;
}

export function ShiftCard({ shift, isOverlay, onClick }: ShiftCardProps) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: shift.id,
        data: { type: 'SHIFT', shift },
        disabled: false // Could be disabled if user lacks permission
    });

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    } : undefined;

    // Helper to format time
    const formatTime = (isoString: string) => {
        const date = new Date(isoString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // Night shift detection (simple visual check)
    const isNight = new Date(shift.start_at).getHours() >= 20 || new Date(shift.start_at).getHours() < 6;

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            onClick={onClick}
            className={cn(
                "relative flex flex-col p-2 rounded-md border text-xs shadow-sm cursor-grab active:cursor-grabbing transition-all",
                isNight ? "bg-slate-900 border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-900",
                shift.status === 'draft' && "border-dashed border-amber-400 bg-amber-50/50",
                shift.is_overtime && "border-red-300 bg-red-50",
                isDragging && "opacity-50 ring-2 ring-primary rotate-2 z-50",
                isOverlay && "ring-2 ring-primary rotate-2 shadow-xl opacity-100 z-50",
                "h-full min-h-[60px]"
            )}
        >
            <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-1 font-semibold">
                    {isNight && <Moon className="h-3 w-3 text-indigo-400" />}
                    <span>{formatTime(shift.start_at)} - {formatTime(shift.end_at)}</span>
                </div>
                {shift.is_overtime && (
                    <span title="Posible Hora Extra">
                        <AlertTriangle className="h-3 w-3 text-red-500" />
                    </span>
                )}
            </div>

            {shift.status === 'draft' && (
                <div className="absolute top-0 right-0 p-0.5 bg-amber-200 rounded-bl text-[9px] font-bold text-amber-800">
                    DRAFT
                </div>
            )}

            {/* Optional: Show Location name if in multi-view */}
            {/* <div className="text-[10px] text-muted-foreground truncate opacity-80">
                {shift.notes || "Sin notas"}
            </div> */}
        </div>
    );
}
