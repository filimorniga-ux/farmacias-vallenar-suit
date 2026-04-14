import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { CartItem } from './cart';
import { getChileISOString } from '../utils';
import { createScopedBrowserStateStorage } from './safePersistStorage';
import { buildOwnershipMeta, type QueueOwnershipMeta } from './persistenceScope';

export interface OfflineSale extends QueueOwnershipMeta {
    id: string;
    timestamp: string;
    items: CartItem[];
    total: number;
    locationId: string;
    terminalId: string;
    sessionId: string;
    userId: string;
    paymentMethod: 'CASH' | 'DEBIT' | 'CREDIT' | 'TRANSFER' | 'MIXED';
    // Sync Metadata
    syncStatus: 'PENDING' | 'SYNCED' | 'ERROR' | 'CONFLICT';
    retryCount: number;
    lastError?: string;
}

interface OfflineSalesState {
    pendingSales: OfflineSale[];
    addOfflineSale: (sale: Omit<OfflineSale, 'id' | 'timestamp' | 'syncStatus' | 'retryCount' | 'lastError' | keyof QueueOwnershipMeta>) => void;
    removeOfflineSale: (id: string) => void;
    updateOfflineSaleStatus: (id: string, status: 'PENDING' | 'SYNCED' | 'ERROR' | 'CONFLICT', error?: string) => void;
    clearOfflineSales: () => void;
}

export const useOfflineSales = create<OfflineSalesState>()(
    persist(
        (set) => ({
            pendingSales: [],
            addOfflineSale: (sale) =>
                set((state) => {
                    const ownership = buildOwnershipMeta();
                    if (!ownership) {
                        return state;
                    }

                    return {
                        pendingSales: [
                            ...state.pendingSales,
                            {
                                id: crypto.randomUUID(),
                                timestamp: getChileISOString(),
                                syncStatus: 'PENDING',
                                retryCount: 0,
                                ...ownership,
                                ...sale,
                            },
                        ],
                    };
                }),
            removeOfflineSale: (id) =>
                set((state) => ({
                    pendingSales: state.pendingSales.filter((sale) => sale.id !== id),
                })),
            updateOfflineSaleStatus: (id, status, error) =>
                set((state) => ({
                    pendingSales: state.pendingSales.map((s) =>
                        s.id === id
                            ? {
                                ...s,
                                syncStatus: status,
                                lastError: error,
                                retryCount: status === 'ERROR' || status === 'CONFLICT' ? s.retryCount + 1 : s.retryCount,
                            }
                            : s
                    ),
                })),
            clearOfflineSales: () => set({ pendingSales: [] }),
        }),
        {
            name: 'farmacias-vallenar-offline-sales',
            storage: createJSONStorage(() => createScopedBrowserStateStorage('farmacias-vallenar-offline-sales', { includeDeviceId: false })),
        }
    )
);
