'use client';

import { useState, useTransition } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea'; // Need to check if exists, otherwise Input
import { upsertShiftV2, deleteShiftV2 } from '@/actions/scheduler-v2';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';

interface ShiftEditDialogProps {
    shift: any; // Type needs refinement but using any for expediency with existing patterns
    isOpen: boolean;
    onClose: () => void;
}

export function ShiftEditDialog({ shift, isOpen, onClose }: ShiftEditDialogProps) {
    const [isPending, startTransition] = useTransition();

    // Helper robusto para formatear HH:MM requeridos por input type="time"
    const formatTimeForInput = (isoString?: string) => {
        if (!isoString) return '';
        try {
            const date = new Date(isoString);
            const hh = date.getHours().toString().padStart(2, '0');
            const mm = date.getMinutes().toString().padStart(2, '0');
            return `${hh}:${mm}`;
        } catch (e) {
            return '';
        }
    };

    const [start, setStart] = useState(formatTimeForInput(shift?.start_at));
    const [end, setEnd] = useState(formatTimeForInput(shift?.end_at));
    const [notes, setNotes] = useState(shift?.notes || '');

    const handleSave = () => {
        if (!start || !end) {
            toast.error('Debe ingresar hora de inicio y término');
            return;
        }

        startTransition(async () => {
            try {
                // Use the original START date as the anchor for both times
                // This prevents issues where the original end date was +1 day but the new shift shouldn't be
                const baseDate = new Date(shift.start_at);

                // Helper to construct date from base + time string
                const createDateFromTime = (base: Date, timeStr: string) => {
                    const [hh, mm] = timeStr.split(':').map(Number);
                    if (isNaN(hh) || isNaN(mm)) throw new Error('Hora inválida');
                    const d = new Date(base);
                    d.setHours(hh, mm, 0, 0);
                    return d;
                };

                const newStartAt = createDateFromTime(baseDate, start);
                const newEndAt = createDateFromTime(baseDate, end);

                // Handle overnight: if end time is earlier than start time, it must be next day
                if (newEndAt <= newStartAt) {
                    newEndAt.setDate(newEndAt.getDate() + 1);
                }

                // Check for validity
                if (isNaN(newStartAt.getTime()) || isNaN(newEndAt.getTime())) {
                    throw new Error('Fecha generada inválida');
                }

                const res = await upsertShiftV2({
                    id: shift.id,
                    userId: shift.user_id,
                    locationId: shift.location_id,
                    startAt: newStartAt.toISOString(),
                    endAt: newEndAt.toISOString(),
                    notes
                });

                if (res.success) {
                    toast.success('Turno actualizado');
                    onClose();
                } else {
                    toast.error(res.error || 'Error al actualizar');
                }
            } catch (err) {
                console.error(err);
                toast.error('Error procesando las fechas');
            }
        });
    };

    const handleDelete = () => {
        if (!confirm('¿Eliminar este turno?')) return;
        startTransition(async () => {
            const res = await deleteShiftV2(shift.id);
            if (res.success) {
                toast.success('Turno eliminado');
                onClose();
            } else {
                toast.error('Error al eliminar');
            }
        });
    };

    if (!shift) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Editar Turno</DialogTitle>
                    <DialogDescription>
                        {shift.user_name}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="start">Inicio</Label>
                            <Input id="start" type="time" value={start} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStart(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="end">Término</Label>
                            <Input id="end" type="time" value={end} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnd(e.target.value)} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="notes">Notas</Label>
                        <Input id="notes" value={notes} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNotes(e.target.value)} placeholder="Ej: Cubre colación" />
                    </div>
                </div>
                <DialogFooter className="flex justify-between sm:justify-between">
                    <Button variant="destructive" size="icon" onClick={handleDelete} disabled={isPending}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button onClick={handleSave} disabled={isPending}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Guardar Cambios
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
