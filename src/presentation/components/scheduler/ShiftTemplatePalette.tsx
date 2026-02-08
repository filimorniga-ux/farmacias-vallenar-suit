import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { GripVertical } from 'lucide-react';

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
    return (
        <div className="w-64 border-r bg-muted/10 flex flex-col h-full">
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
