'use client';

import { useState, useTransition } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { upsertTimeOffRequest } from '@/actions/scheduler-v2';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface TimeOffModalProps {
    isOpen: boolean;
    onClose: () => void;
    users: any[];
}

export function TimeOffModal({ isOpen, onClose, users }: TimeOffModalProps) {
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    const [userId, setUserId] = useState('');
    const [type, setType] = useState('VACATION');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [notes, setNotes] = useState('');

    const handleSubmit = () => {
        if (!userId || !startDate || !endDate) {
            return toast.error('Faltan campos obligatorios');
        }

        startTransition(async () => {
            const res = await upsertTimeOffRequest({
                userId,
                type: type as any,
                startDate,
                endDate,
                notes,
                status: 'APPROVED'
            });

            if (res.success) {
                toast.success('Ausencia registrada');
                router.refresh();
                onClose();
                setUserId('');
                setType('VACATION');
                setStartDate('');
                setEndDate('');
                setNotes('');
            } else {
                toast.error(res.error || 'Error al registrar ausencia');
            }
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Registrar Ausencia / Bloqueo</DialogTitle>
                    <DialogDescription>
                        Bloquea días para vacaciones, licencias o permisos.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label>Funcionario</Label>
                        <Select value={userId} onValueChange={setUserId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccionar..." />
                            </SelectTrigger>
                            <SelectContent className='max-h-[200px]'>
                                {users.map(u => (
                                    <SelectItem key={u.id} value={u.id}>
                                        {u.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Tipo de Ausencia</Label>
                        <Select value={type} onValueChange={setType}>
                            <SelectTrigger>
                                <SelectValue placeholder="Tipo" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="VACATION">Vacaciones</SelectItem>
                                <SelectItem value="SICK_LEAVE">Licencia Médica</SelectItem>
                                <SelectItem value="PERSONAL">Permiso Personal</SelectItem>
                                <SelectItem value="FAMILY_EMERGENCY">Emergencia Familiar</SelectItem>
                                <SelectItem value="OTHER">Otro</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Desde</Label>
                            <Input type="date" value={startDate} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStartDate(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Hasta</Label>
                            <Input type="date" value={endDate} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEndDate(e.target.value)} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Notas</Label>
                        <Input value={notes} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNotes(e.target.value)} placeholder="Ej: Aprobado por Gerencia" />
                    </div>

                    <Button className="w-full mt-2" onClick={handleSubmit} disabled={isPending}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Registrar Ausencia
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
