'use client';

import { useState } from 'react';
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
import { ScheduleNavigator } from './ScheduleNavigator';
import { ShiftCard } from './ShiftCard';
import { Button } from '@/components/ui/button';
import { upsertShiftV2, generateDraftScheduleV2 } from '@/actions/scheduler-v2';

interface SchedulerContainerProps {
    initialShifts: any[];
    templates: any[];
    staff: any[];
    timeOffs: any[];
    locationId: string;
    weekStart: Date;
}

export function SchedulerContainer({
    initialShifts,
    templates,
    staff,
    timeOffs,
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

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // Avoid accidental drags
            },
        })
    );

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

        // Dropped on a Grid Cell
        if (over.data.current?.type === 'CELL') {
            const { day, userId } = over.data.current; // Target Cell Info
            const draggedData = active.data.current; // Source Item Info

            if (!draggedData) return;

            if (draggedData.type === 'TEMPLATE') {
                // Creating new shift from Template
                const template = draggedData.template;

                // Construct timestamps
                const startDate = new Date(`${day}T${template.start_time}`);
                let endDate = new Date(`${day}T${template.end_time}`);

                // Handle overnight crossing roughly for MVP
                if (endDate <= startDate) {
                    endDate.setDate(endDate.getDate() + 1);
                }

                toast.promise(upsertShiftV2({
                    userId,
                    locationId,
                    startAt: startDate.toISOString(),
                    endAt: endDate.toISOString(),
                    assignedBy: undefined,
                    notes: `Asignado desde ${template.name}`
                }), {
                    loading: 'Creando turno...',
                    success: 'Turno creado',
                    error: 'Error al crear turno'
                });

            } else if (draggedData.type === 'SHIFT') {
                // Moving existing shift
                const shift = draggedData.shift;
                const originalStart = new Date(shift.start_at);
                const originalEnd = new Date(shift.end_at);
                const duration = originalEnd.getTime() - originalStart.getTime();

                // New Start Date (Target Day) + Original Time
                const newStart = new Date(`${day}T${originalStart.toLocaleTimeString('es-CL', { hour12: false })}`);
                const newEnd = new Date(newStart.getTime() + duration);

                if (shift.user_id === userId && shift.start_at.startsWith(day)) {
                    return;
                }

                toast.promise(upsertShiftV2({
                    id: shift.id,
                    userId,
                    locationId,
                    startAt: newStart.toISOString(),
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

    const handleDateChange = (newDate: Date) => {
        const dateStr = format(newDate, 'yyyy-MM-dd');
        const params = new URLSearchParams(window.location.search);
        params.set('date', dateStr);
        router.push(`?${params.toString()}`);
    };

    return (
        <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="flex flex-col h-[calc(100vh-64px)]">
                {/* Toolbar */}
                <div className="flex items-center justify-between p-4 border-b bg-white gap-4">
                    <ScheduleNavigator
                        currentDate={weekStart}
                        viewMode={viewMode}
                        onViewChange={setViewMode}
                        onDateChange={handleDateChange}
                    />

                    <div className="flex gap-2 ml-auto">
                        <Button variant="outline" onClick={() => setIsTimeOffOpen(true)} className="border-red-200 hover:bg-red-50 text-red-700">
                            📅 Ausencia
                        </Button>
                        <Button variant="outline" onClick={handleGenerateDraft}>
                            🪄 Autocompletar
                        </Button>
                        <Button>Publicar</Button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex flex-1 overflow-hidden">
                    {viewMode === 'WEEK' && <ShiftTemplatePalette templates={templates} />}

                    {viewMode === 'WEEK' ? (
                        <InteractiveGrid
                            weekStart={weekStart}
                            staff={staff}
                            shifts={initialShifts}
                            timeOffs={timeOffs}
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
        </DndContext>
    );
}
