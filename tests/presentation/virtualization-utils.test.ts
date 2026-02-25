import { describe, expect, it, vi } from 'vitest';
import { getLastVisibleVirtualIndex, scheduleDeferredTask } from '@/presentation/utils/virtualization';

describe('virtualization utils', () => {
    it('retorna -1 cuando no hay filas visibles', () => {
        expect(getLastVisibleVirtualIndex([])).toBe(-1);
    });

    it('retorna el índice de la última fila visible', () => {
        const visibleItems = [{ index: 4 }, { index: 5 }, { index: 9 }] as const;
        expect(getLastVisibleVirtualIndex([...visibleItems])).toBe(9);
    });

    it('difiere la tarea al siguiente task y permite cancelación', () => {
        vi.useFakeTimers();
        const task = vi.fn();

        const cancel = scheduleDeferredTask(task);
        expect(task).not.toHaveBeenCalled();

        vi.runAllTimers();
        expect(task).toHaveBeenCalledTimes(1);

        const task2 = vi.fn();
        const cancel2 = scheduleDeferredTask(task2);
        cancel2();
        vi.runAllTimers();
        expect(task2).not.toHaveBeenCalled();

        cancel();
        vi.useRealTimers();
    });
});
