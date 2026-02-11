import React, { useState } from 'react';
import { Clock, Calendar } from 'lucide-react';
import { useChileClock } from '../../hooks/useChileClock';

interface ChileClockProps {
    /** "full" = fecha + hora (desktop), "compact" = solo hora (móvil) */
    variant?: 'full' | 'compact';
}

/**
 * Reloj permanente con hora oficial Santiago de Chile.
 * Garantiza que el usuario siempre vea la misma hora que usan
 * los módulos, tickets, reportes y exports de la aplicación.
 */
const ChileClock: React.FC<ChileClockProps> = ({ variant = 'full' }) => {
    const { time, fullDate } = useChileClock();
    const [showDate, setShowDate] = useState(false);

    // Separar hora y segundos para la animación
    const [hhmm, seconds] = [time.slice(0, 5), time.slice(5)];

    if (variant === 'compact') {
        return (
            <button
                onClick={() => setShowDate(!showDate)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg
                   bg-slate-50 border border-slate-100
                   hover:bg-sky-50 hover:border-sky-100
                   transition-all duration-200 select-none"
                title="Hora oficial Santiago de Chile (America/Santiago)"
                aria-label="Reloj Santiago de Chile"
            >
                <Clock size={13} className="text-sky-500 flex-shrink-0" />
                {showDate ? (
                    <span className="text-[11px] font-semibold text-slate-600 tabular-nums whitespace-nowrap">
                        {fullDate}
                    </span>
                ) : (
                    <span className="text-[11px] font-bold text-slate-700 tabular-nums tracking-tight">
                        {hhmm}
                        <span className="animate-pulse">{seconds}</span>
                    </span>
                )}
            </button>
        );
    }

    // Desktop full variant
    return (
        <div
            className="flex items-center gap-3 px-3 py-1.5 rounded-xl
                 bg-slate-50/80 border border-slate-100
                 select-none"
            title="Hora oficial Santiago de Chile (America/Santiago)"
        >
            {/* Fecha */}
            <div className="flex items-center gap-1.5">
                <Calendar size={14} className="text-sky-500" />
                <span className="text-xs font-medium text-slate-500 capitalize whitespace-nowrap">
                    {fullDate}
                </span>
            </div>

            {/* Separador */}
            <div className="w-px h-4 bg-slate-200" />

            {/* Hora */}
            <div className="flex items-center gap-1.5">
                <Clock size={14} className="text-sky-500" />
                <span className="text-sm font-bold text-slate-700 tabular-nums tracking-tight">
                    {hhmm}
                    <span className="animate-pulse text-slate-400">{seconds}</span>
                </span>
            </div>
        </div>
    );
};

export default ChileClock;
