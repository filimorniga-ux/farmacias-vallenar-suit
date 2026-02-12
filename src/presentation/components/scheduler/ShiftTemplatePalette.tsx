import { useState, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { GripVertical, ChevronLeft, ChevronRight, LayoutTemplate } from 'lucide-react';

interface TemplateItemProps {
    template: any;
}

function TemplateItem({ template }: TemplateItemProps) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `template-${template.id}`,
        data: { type: 'TEMPLATE', template },
    });

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    } : undefined;

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            className={cn(
                "flex items-center gap-2 p-2 rounded-md border text-sm shadow-sm cursor-grab active:cursor-grabbing hover:bg-accent transition-colors bg-white",
                isDragging && "opacity-50 ring-2 ring-primary"
            )}
        >
            <div className="h-8 w-1 rounded-full" style={{ backgroundColor: template.color || '#3b82f6' }} />
            <div className="flex-1">
                <div className="font-medium leading-none flex items-center gap-2">
                    {template.name}
                    {template.is_rest_day && <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded font-bold">LIBRE</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                    {template.is_rest_day
                        ? 'Día de descanso'
                        : `${template.start_time.slice(0, 5)} - ${template.end_time.slice(0, 5)} (${template.break_minutes || 0}m)`
                    }
                </div>
            </div>
            <GripVertical className="h-4 w-4 text-muted-foreground/50" />
        </div>
    );
}

interface PaletteProps {
    templates: any[];
}

export function ShiftTemplatePalette({ templates }: PaletteProps) {
    const [isMobile, setIsMobile] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const check = () => {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
            // En desktop siempre visible; en mobile comienza cerrado
            if (!mobile) setIsOpen(false);
        };
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // Desktop: panel lateral fijo
    if (!isMobile) {
        return (
            <div className="w-64 border-r bg-muted/10 flex flex-col h-full shrink-0">
                <div className="p-4 border-b bg-white/50">
                    <h3 className="font-semibold text-sm mb-1">Paleta de Turnos</h3>
                    <p className="text-xs text-muted-foreground">Arrastra para asignar</p>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {templates.map(tmpl => (
                        <TemplateItem key={tmpl.id} template={tmpl} />
                    ))}
                    {templates.length === 0 && (
                        <div className="text-center p-4 border-2 border-dashed rounded-lg">
                            <p className="text-xs text-muted-foreground">No hay plantillas</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Mobile: botón flotante + drawer lateral
    return (
        <>
            {/* Botón toggle pegado al borde izquierdo */}
            <button
                onClick={() => setIsOpen(v => !v)}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-1 bg-white border border-l-0 border-slate-200 rounded-r-xl shadow-md px-1.5 py-3"
                aria-label={isOpen ? 'Cerrar paleta' : 'Abrir paleta de turnos'}
            >
                {isOpen
                    ? <ChevronLeft className="h-4 w-4 text-slate-500" />
                    : <ChevronRight className="h-4 w-4 text-slate-500" />
                }
                <LayoutTemplate className="h-4 w-4 text-cyan-600" />
                {!isOpen && templates.length > 0 && (
                    <span className="text-[10px] font-bold text-cyan-700 bg-cyan-50 rounded-full px-1">
                        {templates.length}
                    </span>
                )}
            </button>

            {/* Backdrop */}
            {isOpen && (
                <div
                    className="absolute inset-0 z-20 bg-black/30"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Drawer lateral */}
            <div
                className={cn(
                    "absolute left-0 top-0 h-full z-30 w-72 bg-white border-r shadow-xl flex flex-col transition-transform duration-300",
                    isOpen ? "translate-x-0" : "-translate-x-full"
                )}
            >
                <div className="p-4 border-b bg-white/50 flex items-center justify-between">
                    <div>
                        <h3 className="font-semibold text-sm mb-1">Paleta de Turnos</h3>
                        <p className="text-xs text-muted-foreground">Toca y arrastra para asignar</p>
                    </div>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="p-1.5 rounded-lg hover:bg-slate-100"
                    >
                        <ChevronLeft className="h-5 w-5 text-slate-500" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {templates.map(tmpl => (
                        <TemplateItem key={tmpl.id} template={tmpl} />
                    ))}
                    {templates.length === 0 && (
                        <div className="text-center p-4 border-2 border-dashed rounded-lg">
                            <p className="text-xs text-muted-foreground">No hay plantillas</p>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
