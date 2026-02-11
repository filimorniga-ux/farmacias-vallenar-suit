'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { upsertShiftV2, deleteShiftV2 } from '@/actions/scheduler-v2';
import { toast } from 'sonner';
import { Loader2, Trash2, Clock, Coffee, FileText, AlertTriangle } from 'lucide-react';

const TIMEZONE = 'America/Santiago';

function formatTimeForInput(isoString: string): string {
    return new Intl.DateTimeFormat('en-CA', {
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

function getDatePart(isoString: string): string {
    return new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: TIMEZONE
    }).format(new Date(isoString));
}

/** Compute duration between two HH:MM strings in hours */
function computeHours(start: string, end: string): number {
    if (!start || !end) return 0;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let startMin = sh * 60 + sm;
    let endMin = eh * 60 + em;
    if (endMin <= startMin) endMin += 24 * 60; // overnight
    return (endMin - startMin) / 60;
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
    const [hasBreak, setHasBreak] = useState(false);
    const [breakStart, setBreakStart] = useState('');
    const [breakEnd, setBreakEnd] = useState('');

    useEffect(() => {
        if (shift) {
            setStartTime(formatTimeForInput(shift.start_at));
            setEndTime(formatTimeForInput(shift.end_at));
            setNotes(shift.notes || '');

            // Break / Colación
            if (shift.break_start_at && shift.break_end_at) {
                setHasBreak(true);
                setBreakStart(formatTimeForInput(shift.break_start_at));
                setBreakEnd(formatTimeForInput(shift.break_end_at));
            } else if (shift.break_minutes > 0) {
                setHasBreak(true);
                // Estimate break in the middle
                const midTime = formatTimeForInput(shift.start_at);
                setBreakStart(midTime);
                setBreakEnd(midTime);
            } else {
                setHasBreak(false);
                setBreakStart('');
                setBreakEnd('');
            }
        }
    }, [shift]);

    // Computed durations
    const grossHours = useMemo(() => computeHours(startTime, endTime), [startTime, endTime]);
    const breakMinutes = useMemo(() => {
        if (!hasBreak || !breakStart || !breakEnd) return 0;
        return Math.round(computeHours(breakStart, breakEnd) * 60);
    }, [hasBreak, breakStart, breakEnd]);
    const netHours = useMemo(() => Math.max(0, grossHours - breakMinutes / 60), [grossHours, breakMinutes]);

    if (!shift) return null;

    const isDraft = shift.status === 'draft';

    const handleSave = () => {
        if (!startTime || !endTime) {
            return toast.error('Hora de inicio y término son obligatorias');
        }

        const timeRegex = /^\d{2}:\d{2}$/;
        if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
            return toast.error('Formato de hora inválido (HH:MM)');
        }

        if (hasBreak && breakStart && breakEnd) {
            if (!timeRegex.test(breakStart) || !timeRegex.test(breakEnd)) {
                return toast.error('Formato de hora de colación inválido');
            }
        }

        const datePart = getDatePart(shift.start_at);

        // Build ISO timestamps
        const newStartISO = new Date(`${datePart}T${startTime}:00`).toISOString();
        let newEndISO = new Date(`${datePart}T${endTime}:00`).toISOString();

        // Handle overnight
        if (new Date(newEndISO) <= new Date(newStartISO)) {
            const nextDay = new Date(`${datePart}T${endTime}:00`);
            nextDay.setDate(nextDay.getDate() + 1);
            newEndISO = nextDay.toISOString();
        }

        // Break timestamps
        let breakStartISO: string | null = null;
        let breakEndISO: string | null = null;
        let breakMin = 0;

        if (hasBreak && breakStart && breakEnd) {
            breakStartISO = new Date(`${datePart}T${breakStart}:00`).toISOString();
            breakEndISO = new Date(`${datePart}T${breakEnd}:00`).toISOString();
            if (new Date(breakEndISO) <= new Date(breakStartISO)) {
                const nextDay = new Date(`${datePart}T${breakEnd}:00`);
                nextDay.setDate(nextDay.getDate() + 1);
                breakEndISO = nextDay.toISOString();
            }
            breakMin = breakMinutes;
        }

        startTransition(async () => {
            const res = await upsertShiftV2({
                id: shift.id,
                userId: shift.user_id,
                locationId: shift.location_id,
                startAt: newStartISO,
                endAt: newEndISO,
                notes: notes || undefined,
                breakStartAt: breakStartISO,
                breakEndAt: breakEndISO,
                breakMinutes: breakMin,
                shiftTemplateId: shift.shift_template_id || undefined,
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
            <DialogContent className="sm:max-w-[480px]">
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

                <div className="grid gap-5 py-4">
                    {/* Duration Summary Cards */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <div className="text-xl font-bold text-blue-800">
                                {grossHours.toFixed(1)}h
                            </div>
                            <div className="text-[10px] text-blue-600 font-medium">Bruto</div>
                        </div>
                        {hasBreak && breakMinutes > 0 && (
                            <div className="text-center p-3 bg-amber-50 rounded-lg border border-amber-200">
                                <div className="text-xl font-bold text-amber-800">
                                    {breakMinutes}min
                                </div>
                                <div className="text-[10px] text-amber-600 font-medium">Colación</div>
                            </div>
                        )}
                        <div className={`text-center p-3 rounded-lg border ${hasBreak && breakMinutes > 0 ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200 col-span-2'}`}>
                            <div className={`text-xl font-bold ${netHours > 9 ? 'text-red-600' : 'text-green-800'}`}>
                                {netHours.toFixed(1)}h
                            </div>
                            <div className="text-[10px] text-green-600 font-medium flex items-center justify-center gap-1">
                                Neto
                                {netHours > 9 && <AlertTriangle className="h-3 w-3 text-red-500" />}
                            </div>
                        </div>
                    </div>

                    {/* Shift Time Inputs */}
                    <div>
                        <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2 block">
                            Horario del Turno
                        </Label>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">Entrada</Label>
                                <input
                                    type="time"
                                    value={startTime}
                                    onChange={(e) => setStartTime(e.target.value)}
                                    className="w-full h-11 px-3 border border-slate-300 rounded-md text-center font-mono text-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">Salida</Label>
                                <input
                                    type="time"
                                    value={endTime}
                                    onChange={(e) => setEndTime(e.target.value)}
                                    className="w-full h-11 px-3 border border-slate-300 rounded-md text-center font-mono text-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Break / Colación Section */}
                    <div className="border rounded-lg p-3 space-y-3 bg-slate-50/50">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                                <Coffee className="h-3.5 w-3.5" />
                                Colación
                            </Label>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={hasBreak}
                                onClick={() => {
                                    const newVal = !hasBreak;
                                    setHasBreak(newVal);
                                    if (newVal && !breakStart) {
                                        const [sh, sm] = startTime.split(':').map(Number);
                                        const bStartMin = sh * 60 + sm + 240;
                                        const bEndMin = bStartMin + 60;
                                        setBreakStart(`${String(Math.floor(bStartMin / 60) % 24).padStart(2, '0')}:${String(bStartMin % 60).padStart(2, '0')}`);
                                        setBreakEnd(`${String(Math.floor(bEndMin / 60) % 24).padStart(2, '0')}:${String(bEndMin % 60).padStart(2, '0')}`);
                                    }
                                }}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${hasBreak ? 'bg-primary' : 'bg-slate-300'
                                    }`}
                            >
                                <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm ${hasBreak ? 'translate-x-6' : 'translate-x-1'
                                    }`} />
                            </button>
                        </div>

                        {hasBreak && (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Inicio Colación</Label>
                                    <input
                                        type="time"
                                        value={breakStart}
                                        onChange={(e) => setBreakStart(e.target.value)}
                                        className="w-full h-10 px-3 border border-amber-300 rounded-md text-center font-mono text-base bg-white focus:outline-none focus:ring-2 focus:ring-amber-300/30 focus:border-amber-400"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Fin Colación</Label>
                                    <input
                                        type="time"
                                        value={breakEnd}
                                        onChange={(e) => setBreakEnd(e.target.value)}
                                        className="w-full h-10 px-3 border border-amber-300 rounded-md text-center font-mono text-base bg-white focus:outline-none focus:ring-2 focus:ring-amber-300/30 focus:border-amber-400"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Notes */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5" /> Notas
                        </Label>
                        <Textarea
                            value={notes}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                            placeholder="Ej: Reemplazo por licencia de..."
                            rows={2}
                            className="text-sm resize-none"
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2 border-t">
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
                        <Button size="sm" onClick={handleSave} disabled={isPending} className="gap-1 min-w-[100px]">
                            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                            Guardar
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
