import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type OutboxItemType = 'CASH_MOVEMENT' | 'CLIENT_CREATE' | 'STOCK_ADJUST' | 'PRODUCT_CREATE';

export interface OutboxItem {
    id: string;
    type: OutboxItemType;
    payload: any;
    createdAt: number;
    status: 'PENDING' | 'ERROR' | 'CONFLICT';
    retryCount: number;
    lastError?: string;
}

interface OutboxState {
    queue: OutboxItem[];
    addToOutbox: (type: OutboxItemType, payload: any) => void;
    removeFromOutbox: (id: string) => void;
    updateOutboxItemStatus: (id: string, status: OutboxItem['status'], error?: string) => void;
    clearOutbox: () => void;
    isSyncing: boolean;
    setSyncing: (isSyncing: boolean) => void;
}

export const useOutboxStore = create<OutboxState>()(
    persist(
        (set) => ({
            queue: [],
            addToOutbox: (type, payload) =>
                set((state) => ({
                    queue: [
                        ...state.queue,
                        {
                            id: crypto.randomUUID(),
                            type,
                            payload,
                            createdAt: Date.now(),
                            status: 'PENDING',
                            retryCount: 0,
                        },
                    ],
                })),
            removeFromOutbox: (id) =>
                set((state) => ({
                    queue: state.queue.filter((item) => item.id !== id),
                })),
            updateOutboxItemStatus: (id, status, error) =>
                set((state) => ({
                    queue: state.queue.map((item) =>
                        item.id === id
                            ? {
                                ...item,
                                status,
                                lastError: error,
                                retryCount: status === 'ERROR' ? item.retryCount + 1 : item.retryCount,
                            }
                            : item
                    ),
                })),
            clearOutbox: () => set({ queue: [] }),
            isSyncing: false,
            setSyncing: (isSyncing) => set({ isSyncing }),
        }),
        {
            name: 'farmacias-vallenar-outbox',
            partialize: (state) => ({ queue: state.queue }), // Don't persist isSyncing
        }
    )
);
