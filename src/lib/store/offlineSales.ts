import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CartItem } from './cart';

export interface OfflineSale {
    id: string;
    timestamp: string;
    items: CartItem[];
    total: number;
}

interface OfflineSalesState {
    pendingSales: OfflineSale[];
    addOfflineSale: (items: CartItem[], total: number) => void;
    removeOfflineSale: (id: string) => void;
    clearOfflineSales: () => void;
}

export const useOfflineSales = create<OfflineSalesState>()(
    persist(
        (set) => ({
            pendingSales: [],
            addOfflineSale: (items, total) =>
                set((state) => ({
                    pendingSales: [
                        ...state.pendingSales,
                        {
                            id: crypto.randomUUID(),
                            timestamp: new Date().toISOString(),
                            items,
                            total,
                        },
                    ],
                })),
            removeOfflineSale: (id) =>
                set((state) => ({
                    pendingSales: state.pendingSales.filter((sale) => sale.id !== id),
                })),
            clearOfflineSales: () => set({ pendingSales: [] }),
        }),
        {
            name: 'farmacias-vallenar-offline-sales',
        }
    )
);
