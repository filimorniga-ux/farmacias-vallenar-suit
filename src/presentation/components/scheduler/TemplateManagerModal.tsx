'use client';

import { useState, useTransition } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createShiftTemplate, deleteShiftTemplate } from '@/actions/scheduler-v2';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';

interface TemplateManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    templates: any[];
}

export function TemplateManagerModal({ isOpen, onClose, templates }: TemplateManagerModalProps) {
    const [isPending, startTransition] = useTransition();

    // Form State
    const [name, setName] = useState('');
    const [start, setStart] = useState('08:00');
    const [end, setEnd] = useState('16:00');
    const [color, setColor] = useState('#3b82f6');
    const [breakMinutes, setBreakMinutes] = useState(0);
    const [breakStart, setBreakStart] = useState('');
    const [breakEnd, setBreakEnd] = useState('');
    const [isRestDay, setIsRestDay] = useState(false);

    const handleCreate = () => {
        if (!name) return toast.error('El nombre es requerido');
        if (!isRestDay && (!start || !end)) return toast.error('Horario requerido para días laborales');

        startTransition(async () => {
            const res = await createShiftTemplate({
                name,
                start: isRestDay ? '00:00' : start,
                end: isRestDay ? '00:00' : end,
                color,
                breakMinutes,
                isRestDay,
                breakStart: isRestDay ? undefined : (breakStart || undefined),
                breakEnd: isRestDay ? undefined : (breakEnd || undefined)
            });

            if (res.success) {
                toast.success('Plantilla creada');
                // Reset form
                setName('');
                setBreakMinutes(0);
                setBreakStart('');
                setBreakEnd('');
                setIsRestDay(false);
            } else {
                toast.error(res.error || 'Error al crear plantilla');
            }
        });
    };

    const handleDelete = (id: string) => {
        if (!confirm('¿Estás seguro de eliminar esta plantilla?')) return;

        startTransition(async () => {
            const res = await deleteShiftTemplate(id);
            if (res.success) {
                toast.success('Plantilla eliminada');
            } else {
                toast.error('Error al eliminar');
            }
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Gestionar Plantillas</DialogTitle>
                    <DialogDescription>Crea nuevas plantillas o elimina las existentes.</DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 py-4">
                    {/* Create New */}
                    <div className="space-y-4 border p-4 rounded-lg bg-muted/20">
                        <h4 className="text-sm font-medium">Nueva Plantilla</h4>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Nombre</Label>
                                <Input placeholder="Ej: Turno Mañana" value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} />
                            </div>

                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="isRestDay"
                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                    checked={isRestDay}
                                    onChange={(e) => setIsRestDay(e.target.checked)}
                                />
                                <Label htmlFor="isRestDay" className="cursor-pointer">Es día de descanso (Libre)</Label>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className={isRestDay ? "text-muted-foreground" : ""}>Inicio</Label>
                                    <Input
                                        type="time"
                                        value={start}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStart(e.target.value)}
                                        disabled={isRestDay}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className={isRestDay ? "text-muted-foreground" : ""}>Término</Label>
                                    <Input
                                        type="time"
                                        value={end}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnd(e.target.value)}
                                        disabled={isRestDay}
                                    />
                                </div>
                            </div>

                            {/* Detailed Break Times */}
                            <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-2">
                                    <Label className={isRestDay ? "text-muted-foreground" : "text-xs font-bold"}>Inicio Colación</Label>
                                    <Input
                                        type="time"
                                        value={breakStart}
                                        onChange={(e) => {
                                            setBreakStart(e.target.value);
                                            // Auto-calc duration if both set
                                            if (e.target.value && breakEnd) {
                                                const s = new Date(`2000-01-01T${e.target.value}`);
                                                const eTime = new Date(`2000-01-01T${breakEnd}`);
                                                if (eTime > s) {
                                                    const diff = (eTime.getTime() - s.getTime()) / 60000;
                                                    setBreakMinutes(diff);
                                                }
                                            }
                                        }}
                                        disabled={isRestDay}
                                        className="text-xs"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className={isRestDay ? "text-muted-foreground" : "text-xs font-bold"}>Fin Colación</Label>
                                    <Input
                                        type="time"
                                        value={breakEnd}
                                        onChange={(e) => {
                                            setBreakEnd(e.target.value);
                                            // Auto-calc duration if both set
                                            if (breakStart && e.target.value) {
                                                const s = new Date(`2000-01-01T${breakStart}`);
                                                const eTime = new Date(`2000-01-01T${e.target.value}`);
                                                if (eTime > s) {
                                                    const diff = (eTime.getTime() - s.getTime()) / 60000;
                                                    setBreakMinutes(diff);
                                                }
                                            }
                                        }}
                                        disabled={isRestDay}
                                        className="text-xs"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className={isRestDay ? "text-muted-foreground" : "text-xs font-bold"}>Total (min)</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="15"
                                        value={breakMinutes}
                                        readOnly
                                        disabled={isRestDay}
                                        className="bg-slate-50 text-xs font-bold"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Color</Label>
                                <div className="flex gap-2">
                                    <Input type="color" className="w-12 h-9 p-1" value={color} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setColor(e.target.value)} />
                                    <span className="text-xs text-muted-foreground self-center">{color}</span>
                                </div>
                            </div>
                        </div>

                        <Button onClick={handleCreate} disabled={isPending} className="w-full mt-2">
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Crear Plantilla
                        </Button>
                    </div>

                    {/* List Existing */}
                    <div className="space-y-2">
                        <h4 className="text-sm font-medium">Plantillas Existentes</h4>
                        <div className="max-h-[200px] overflow-y-auto space-y-2 pr-2">
                            {templates.map(t => (
                                <div key={t.id} className="flex items-center justify-between p-2 border rounded-md bg-white text-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                                        <div>
                                            <div className="font-medium flex items-center gap-2">
                                                {t.name}
                                                {t.is_rest_day && <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded">LIBRE</span>}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {t.is_rest_day ? 'Día de descanso' : (
                                                    <span>
                                                        {t.start_time.slice(0, 5)} - {t.end_time.slice(0, 5)}
                                                        {t.break_start_time && t.break_end_time ? (
                                                            <span className="ml-2 text-slate-500">
                                                                (☕ {t.break_start_time.slice(0, 5)} - {t.break_end_time.slice(0, 5)})
                                                            </span>
                                                        ) : (
                                                            <span className="ml-2 text-slate-500">({t.break_minutes}m colación)</span>
                                                        )}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(t.id)} disabled={isPending}>
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                </div>
                            ))}
                            {templates.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No hay plantillas creadas.</p>}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
