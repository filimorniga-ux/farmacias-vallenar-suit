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

    const handleCreate = () => {
        if (!name) return toast.error('El nombre es requerido');

        startTransition(async () => {
            const res = await createShiftTemplate({ name, start, end, color });
            if (res.success) {
                toast.success('Plantilla creada');
                // Reset form
                setName('');
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
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Nombre</Label>
                                <Input placeholder="Ej: Turno Mañana" value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Color</Label>
                                <div className="flex gap-2">
                                    <Input type="color" className="w-12 h-9 p-1" value={color} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setColor(e.target.value)} />
                                    <span className="text-xs text-muted-foreground self-center">{color}</span>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Inicio</Label>
                                <Input type="time" value={start} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStart(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Término</Label>
                                <Input type="time" value={end} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnd(e.target.value)} />
                            </div>
                        </div>
                        <Button onClick={handleCreate} disabled={isPending} className="w-full">
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
                                            <div className="font-medium">{t.name}</div>
                                            <div className="text-xs text-muted-foreground">{t.start_time.slice(0, 5)} - {t.end_time.slice(0, 5)}</div>
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
