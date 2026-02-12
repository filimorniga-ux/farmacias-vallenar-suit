'use client';

import { useState, useEffect } from 'react';
import {
    DndContext,
    DragOverlay,
    useSensor,
    useSensors,
    PointerSensor,
    DragStartEvent,
    DragEndEvent
} from '@dnd-kit/core';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { toast } from 'sonner';

import { ShiftTemplatePalette } from './ShiftTemplatePalette';
import { InteractiveGrid } from './InteractiveGrid';
import { MonthlyGrid } from './MonthlyGrid';
import { ShiftEditDialog } from './ShiftEditDialog';
import { TimeOffModal } from './TimeOffModal';
import { TemplateManagerModal } from './TemplateManagerModal';
import { ScheduleNavigator } from './ScheduleNavigator';
import { ShiftCard } from './ShiftCard';
import { Settings2, Copy, Send, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { upsertShiftV2, generateDraftScheduleV2, publishScheduleV2, copyPreviousWeek } from '@/actions/scheduler-v2';

// Timezone helper
const TIMEZONE = 'America/Santiago';

function toSantiagoISO(day: string, time: string): string {
    // Construct a proper ISO string for Chile timezone
    // day = 'YYYY-MM-DD', time = 'HH:MM' or 'HH:MM:SS'
    const timeStr = time.length === 5 ? `${time}:00` : time;
    // Create date in Santiago context then convert to ISO
    const dt = new Date(`${day}T${timeStr}`);
    return dt.toISOString();
}

interface SchedulerContainerProps {
    initialShifts: any[];
    templates: any[];
    staff: any[];
    timeOffs: any[];
    hoursSummary: any[];
    locationId: string;
    weekStart: Date;
}

export function SchedulerContainer({
    initialShifts,
    templates,
    staff,
    timeOffs,
    hoursSummary,
    locationId,
    weekStart
}: SchedulerContainerProps) {
    const router = useRouter();
    const [viewMode, setViewMode] = useState<'WEEK' | 'MONTH'>('WEEK');

    // Drag State
    const [activeDragItem, setActiveDragItem] = useState<any>(null);
    const [activeDragType, setActiveDragType] = useState<'SHIFT' | 'TEMPLATE' | null>(null);

    // Modals State
    const [editingShift, setEditingShift] = useState<any>(null);
    const [isTimeOffOpen, setIsTimeOffOpen] = useState(false);
    const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Count draft shifts for publish button
    const draftCount = initialShifts.filter(s => s.status === 'draft').length;

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        const data = active.data.current;
        if (data) {
            setActiveDragType(data.type);
            setActiveDragItem(data.type === 'SHIFT' ? data.shift : data.template);
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveDragItem(null);
        setActiveDragType(null);

        if (!over) return;

        if (over.data.current?.type === 'CELL') {
            const { day, userId } = over.data.current;
            const draggedData = active.data.current;

            if (!draggedData) return;

            if (draggedData.type === 'TEMPLATE') {
                const template = draggedData.template;

                const startISO = toSantiagoISO(day, template.start_time.slice(0, 5));
                let endISO = toSantiagoISO(day, template.end_time.slice(0, 5));

                // Handle overnight crossing
                if (new Date(endISO) <= new Date(startISO)) {
                    const nextDay = new Date(day);
                    nextDay.setDate(nextDay.getDate() + 1);
                    endISO = toSantiagoISO(format(nextDay, 'yyyy-MM-dd'), template.end_time.slice(0, 5));
                }

                toast.promise(upsertShiftV2({
                    userId,
                    locationId,
                    startAt: startISO,
                    endAt: endISO,
                    assignedBy: undefined,
                    notes: `Asignado desde ${template.name}`
                }), {
                    loading: 'Creando turno...',
                    success: 'Turno creado',
                    error: 'Error al crear turno'
                });

            } else if (draggedData.type === 'SHIFT') {
                const shift = draggedData.shift;
                const originalStart = new Date(shift.start_at);
                const originalEnd = new Date(shift.end_at);
                const duration = originalEnd.getTime() - originalStart.getTime();

                // Format original time in Santiago timezone
                const originalTime = new Intl.DateTimeFormat('es-CL', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                    timeZone: TIMEZONE
                }).format(originalStart);

                const newStartISO = toSantiagoISO(day, originalTime);
                const newEnd = new Date(new Date(newStartISO).getTime() + duration);

                if (shift.user_id === userId && shift.start_at.startsWith(day)) {
                    return;
                }

                toast.promise(upsertShiftV2({
                    id: shift.id,
                    userId,
                    locationId,
                    startAt: newStartISO,
                    endAt: newEnd.toISOString()
                }), {
                    loading: 'Moviendo turno...',
                    success: 'Turno actualizado',
                    error: 'Error al mover turno'
                });
            }
        }
    };

    const handleGenerateDraft = async () => {
        toast.promise(generateDraftScheduleV2({
            locationId,
            weekStart: format(weekStart, 'yyyy-MM-dd')
        }), {
            loading: 'Generando borrador...',
            success: (data) => `Borrador generado: ${data.count} turnos`,
            error: 'Error al generar borrador'
        });
    };

    const handlePublish = async () => {
        if (draftCount === 0) {
            toast.info('No hay borradores para publicar');
            return;
        }
        if (!confirm(`¿Publicar ${draftCount} turno(s) en borrador?`)) return;

        toast.promise(publishScheduleV2(locationId, format(weekStart, 'yyyy-MM-dd')), {
            loading: 'Publicando horario...',
            success: (data) => `${data.count} turno(s) publicado(s)`,
            error: 'Error al publicar'
        });
    };

    const handleCopyPrevWeek = async () => {
        toast.promise(copyPreviousWeek(locationId, format(weekStart, 'yyyy-MM-dd')), {
            loading: 'Copiando semana anterior...',
            success: (data) => `${data.count} turnos copiados como borrador`,
            error: (err) => err?.message || 'Error al copiar'
        });
    };

    const handleDateChange = (newDate: Date) => {
        const dateStr = format(newDate, 'yyyy-MM-dd');
        const params = new URLSearchParams(window.location.search);
        params.set('date', dateStr);
        router.push(`?${params.toString()}`);
    };

    if (!isMounted) return null;

    return (
        <DndContext
            id="scheduler-dnd-context"
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="flex flex-col h-[calc(100vh-64px)]">
                {/* Toolbar */}
                <div className="flex items-center justify-between p-3 border-b bg-white gap-3 flex-wrap">
                    <ScheduleNavigator
                        currentDate={weekStart}
                        viewMode={viewMode}
                        onViewChange={setViewMode}
                        onDateChange={handleDateChange}
                    />

                    {/* KPI Strip */}
                    {hoursSummary.length > 0 && viewMode === 'WEEK' && (
                        <div className="flex items-center gap-3 text-xs">
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 border border-blue-200 rounded-md">
                                <span className="font-medium text-blue-700">{initialShifts.length}</span>
                                <span className="text-blue-600">turnos</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 border border-green-200 rounded-md">
                                <span className="font-medium text-green-700">{staff.length}</span>
                                <span className="text-green-600">personas</span>
                            </div>
                            {draftCount > 0 && (
                                <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-200 rounded-md animate-pulse">
                                    <span className="font-medium text-amber-700">{draftCount}</span>
                                    <span className="text-amber-600">borradores</span>
                                </div>
                            )}
                            {hoursSummary.some(h => h.isOvertime) && (
                                <div className="flex items-center gap-1.5 px-2 py-1 bg-red-50 border border-red-200 rounded-md">
                                    <span className="font-medium text-red-700">⚠️</span>
                                    <span className="text-red-600">Horas extra detectadas</span>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex gap-2 ml-auto overflow-x-auto scrollbar-hide">
                        <Button variant="outline" size="sm" onClick={() => setIsTemplateManagerOpen(true)} className="shrink-0">
                            <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Plantillas
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setIsTimeOffOpen(true)} className="border-red-200 hover:bg-red-50 text-red-700 shrink-0">
                            📅 Ausencia
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleCopyPrevWeek} className="shrink-0">
                            <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar Semana
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleGenerateDraft} className="shrink-0">
                            <Wand2 className="mr-1.5 h-3.5 w-3.5" /> Autocompletar
                        </Button>
                        <Button
                            size="sm"
                            onClick={handlePublish}
                            disabled={draftCount === 0}
                            className={`shrink-0 ${draftCount > 0 ? 'bg-green-600 hover:bg-green-700' : ''}`}
                        >
                            <Send className="mr-1.5 h-3.5 w-3.5" /> Publicar{draftCount > 0 ? ` (${draftCount})` : ''}
                        </Button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex flex-1 overflow-hidden relative">
                    {viewMode === 'WEEK' && <ShiftTemplatePalette templates={templates} />}

                    {viewMode === 'WEEK' ? (
                        <InteractiveGrid
                            weekStart={weekStart}
                            staff={staff}
                            shifts={initialShifts}
                            timeOffs={timeOffs}
                            hoursSummary={hoursSummary}
                            onShiftClick={setEditingShift}
                        />
                    ) : (
                        <MonthlyGrid
                            currentDate={weekStart}
                            shifts={initialShifts}
                            timeOffs={timeOffs}
                        />
                    )}
                </div>
            </div>

            {/* Drag Overlay */}
            <DragOverlay>
                {activeDragItem ? (
                    activeDragType === 'SHIFT' ? (
                        <div className="w-[150px]">
                            <ShiftCard shift={activeDragItem} isOverlay />
                        </div>
                    ) : (
                        <div className="p-2 border bg-white shadow-lg rounded-md w-[200px] opacity-90">
                            {activeDragItem.name}
                        </div>
                    )
                ) : null}
            </DragOverlay>

            {/* Dialogs */}
            <ShiftEditDialog
                shift={editingShift}
                isOpen={!!editingShift}
                onClose={() => setEditingShift(null)}
            />

            <TimeOffModal
                isOpen={isTimeOffOpen}
                onClose={() => setIsTimeOffOpen(false)}
                users={staff}
            />

            <TemplateManagerModal
                isOpen={isTemplateManagerOpen}
                onClose={() => setIsTemplateManagerOpen(false)}
                templates={templates}
            />
        </DndContext>
    );
}
