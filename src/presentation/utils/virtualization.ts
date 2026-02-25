import type { VirtualItem } from '@tanstack/react-virtual';

export function getLastVisibleVirtualIndex(
    items: Array<Pick<VirtualItem, 'index'>>
): number {
    return items.length > 0 ? items[items.length - 1].index : -1;
}

export function scheduleDeferredTask(task: () => void): () => void {
    const timer = setTimeout(task, 0);
    return () => clearTimeout(timer);
}
