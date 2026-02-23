import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { CartItem } from './cart';
import { getChileISOString } from '../utils';
import { safeBrowserStateStorage } from './safePersistStorage';

export interface OfflineSale {
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
    addOfflineSale: (sale: Omit<OfflineSale, 'id' | 'timestamp' | 'syncStatus' | 'retryCount' | 'lastError'>) => void;
    removeOfflineSale: (id: string) => void;
    updateOfflineSaleStatus: (id: string, status: 'PENDING' | 'SYNCED' | 'ERROR' | 'CONFLICT', error?: string) => void;
    clearOfflineSales: () => void;
}

export const useOfflineSales = create<OfflineSalesState>()(
    persist(
        (set) => ({
            pendingSales: [],
            addOfflineSale: (sale) =>
                set((state) => ({
                    pendingSales: [
                        ...state.pendingSales,
                        {
                            id: crypto.randomUUID(),
                            timestamp: getChileISOString(),
                            syncStatus: 'PENDING',
                            retryCount: 0,
                            ...sale,
                        },
                    ],
                })),
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
            storage: createJSONStorage(() => safeBrowserStateStorage),
        }
    )
);
