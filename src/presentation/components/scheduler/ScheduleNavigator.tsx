'use client';

import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'; // Will install next
import { format, addWeeks, subWeeks, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

interface ScheduleNavigatorProps {
    currentDate: Date;
    viewMode: 'WEEK' | 'MONTH';
    onDateChange: (date: Date) => void;
    onViewChange: (mode: 'WEEK' | 'MONTH') => void;
}

export function ScheduleNavigator({ currentDate, viewMode, onDateChange, onViewChange }: ScheduleNavigatorProps) {

    const handlePrev = () => {
        if (viewMode === 'WEEK') onDateChange(subWeeks(currentDate, 1));
        else onDateChange(subMonths(currentDate, 1));
    };

    const handleNext = () => {
        if (viewMode === 'WEEK') onDateChange(addWeeks(currentDate, 1));
        else onDateChange(addMonths(currentDate, 1));
    };

    return (
        <div className="flex items-center gap-4 bg-white p-2 rounded-md border shadow-sm">
            {/* View Toggle */}
            <div className="flex bg-muted rounded-md p-1">
                <button
                    onClick={() => onViewChange('WEEK')}
                    className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${viewMode === 'WEEK' ? 'bg-white shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    Semana
                </button>
                <button
                    onClick={() => onViewChange('MONTH')}
                    className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${viewMode === 'MONTH' ? 'bg-white shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    Mes
                </button>
            </div>

            <div className="h-4 w-px bg-border" />

            {/* Date Controls */}
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrev}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>

                <div className="flex items-center gap-2 min-w-[140px] justify-center font-medium text-sm">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="capitalize">
                        {viewMode === 'WEEK'
                            ? `Semana ${format(currentDate, 'd MMM', { locale: es })}`
                            : format(currentDate, 'MMMM yyyy', { locale: es })
                        }
                    </span>
                </div>

                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNext}>
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
