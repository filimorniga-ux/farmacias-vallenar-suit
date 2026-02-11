'use client';

import { useState, useEffect, useTransition } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { upsertShiftV2, deleteShiftV2 } from '@/actions/scheduler-v2';
import { toast } from 'sonner';
import { Loader2, Trash2, Clock, FileText } from 'lucide-react';

const TIMEZONE = 'America/Santiago';

function formatTimeForInput(isoString: string): string {
    return new Intl.DateTimeFormat('es-CL', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: TIMEZONE
    }).format(new Date(isoString));
}

function formatDateForDisplay(isoString: string): string {
    return new Intl.DateTimeFormat('es-CL', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: TIMEZONE
    }).format(new Date(isoString));
}

interface ShiftEditDialogProps {
    shift: any;
    isOpen: boolean;
    onClose: () => void;
}

export function ShiftEditDialog({ shift, isOpen, onClose }: ShiftEditDialogProps) {
    const [isPending, startTransition] = useTransition();
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [notes, setNotes] = useState('');

    useEffect(() => {
        if (shift) {
            setStartTime(formatTimeForInput(shift.start_at));
            setEndTime(formatTimeForInput(shift.end_at));
            setNotes(shift.notes || '');
        }
    }, [shift]);

    if (!shift) return null;

    const durationHours = (new Date(shift.end_at).getTime() - new Date(shift.start_at).getTime()) / (1000 * 60 * 60);
    const isDraft = shift.status === 'draft';

    const handleSave = () => {
        if (!startTime || !endTime) {
            return toast.error('Hora de inicio y término son obligatorias');
        }

        const timeRegex = /^\d{2}:\d{2}$/;
        if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
            return toast.error('Formato de hora inválido (HH:MM)');
        }

        // Reconstruct the date portion from the original shift's start_at, using Santiago timezone
        const originalDate = new Intl.DateTimeFormat('en-CA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            timeZone: TIMEZONE
        }).format(new Date(shift.start_at));

        const newStartISO = new Date(`${originalDate}T${startTime}:00`).toISOString();
        let newEndISO = new Date(`${originalDate}T${endTime}:00`).toISOString();

        // Handle overnight
        if (new Date(newEndISO) <= new Date(newStartISO)) {
            const nextDay = new Date(`${originalDate}T${endTime}:00`);
            nextDay.setDate(nextDay.getDate() + 1);
            newEndISO = nextDay.toISOString();
        }

        startTransition(async () => {
            const res = await upsertShiftV2({
                id: shift.id,
                userId: shift.user_id,
                locationId: shift.location_id,
                startAt: newStartISO,
                endAt: newEndISO,
                notes: notes || undefined
            });

            if (res.success) {
                toast.success('Turno actualizado');
                onClose();
            } else {
                toast.error(res.error || 'Error al guardar');
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

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[420px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5" />
                        Editar Turno
                        {isDraft && (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                                BORRADOR
                            </span>
                        )}
                    </DialogTitle>
                    <DialogDescription>
                        {shift.user_name && <span className="font-medium">{shift.user_name}</span>}
                        {' — '}
                        {formatDateForDisplay(shift.start_at)}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    {/* Duration display */}
                    <div className="text-center p-3 bg-slate-50 rounded-lg border">
                        <div className="text-2xl font-bold text-slate-800">
                            {durationHours.toFixed(1)}h
                        </div>
                        <div className="text-xs text-muted-foreground">Duración actual</div>
                    </div>

                    {/* Time inputs */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold">Inicio</Label>
                            <Input
                                type="time"
                                value={startTime}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStartTime(e.target.value)}
                                className="text-center font-mono text-lg"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold">Término</Label>
                            <Input
                                type="time"
                                value={endTime}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEndTime(e.target.value)}
                                className="text-center font-mono text-lg"
                            />
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                        <Label className="text-xs font-semibold flex items-center gap-1">
                            <FileText className="h-3 w-3" /> Notas
                        </Label>
                        <Textarea
                            value={notes}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                            placeholder="Ej: Reemplazo por licencia de..."
                            rows={2}
                            className="text-sm"
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleDelete}
                            disabled={isPending}
                            className="gap-1"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            Eliminar
                        </Button>
                        <div className="flex-1" />
                        <Button variant="outline" size="sm" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button size="sm" onClick={handleSave} disabled={isPending} className="gap-1">
                            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            Guardar
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
