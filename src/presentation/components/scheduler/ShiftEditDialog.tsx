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

    // Derived state from shift
    // shift.start_at is ISO string
    const initialStart = shift?.start_at ? new Date(shift.start_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '';
    const initialEnd = shift?.end_at ? new Date(shift.end_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '';

    const [start, setStart] = useState(initialStart);
    const [end, setEnd] = useState(initialEnd);
    const [notes, setNotes] = useState(shift?.notes || '');

    const handleSave = () => {
        startTransition(async () => {
            // Construct ISO strings preserving the original DATE
            const originalDate = new Date(shift.start_at);
            const dateStr = originalDate.toISOString().split('T')[0];

            // Handle overnight? If end < start, assumed next day?
            // For strict editing, we might keep the dates. 
            // Simplest approach: Use the date from start_at for both, unless "Noche".
            // If original shift was overnight, we need to be careful.

            // Let's preserve the original dates but update times.
            // Helper to set time
            const setTime = (baseDate: Date, timeStr: string) => {
                const [hh, mm] = timeStr.split(':').map(Number);
                const newDate = new Date(baseDate);
                newDate.setHours(hh, mm, 0, 0);
                return newDate;
            };

            let newStartAt = setTime(new Date(shift.start_at), start);
            let newEndAt = setTime(new Date(shift.end_at), end);

            // Heuristic: If end time is conceptually "next day" but the user edited it...
            // Best logic for this simple UI: 
            // If End < Start, add 1 day to End.
            if (newEndAt < newStartAt) {
                newEndAt.setDate(newEndAt.getDate() + 1);
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
