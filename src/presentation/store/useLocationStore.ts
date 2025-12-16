import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Location, KioskConfig } from '../../domain/types';

interface LocationState {
    locations: Location[];
    kiosks: KioskConfig[];
    currentLocation: Location | null;

    // Actions
    addLocation: (location: Location) => void;
    setLocations: (locations: Location[]) => void;
    updateLocation: (id: string, data: Partial<Location>) => void;
    switchLocation: (id: string, onSuccess?: () => void) => void;
    canSwitchLocation: (userRole: string) => boolean;
    fetchLocations: () => Promise<void>; // Sync with Backend

    registerKiosk: (kiosk: KioskConfig) => void;
    updateKioskStatus: (id: string, status: 'ACTIVE' | 'INACTIVE') => void;
    generatePairingCode: (kioskId: string) => string;
}

// Mock Initial Data - Removed to force fetch/clean state
const INITIAL_LOCATIONS: Location[] = [];

const INITIAL_KIOSKS: KioskConfig[] = [];

export const useLocationStore = create<LocationState>()(
    persist(
        (set, get) => ({
            locations: INITIAL_LOCATIONS,
            kiosks: INITIAL_KIOSKS,
            currentLocation: null, // No default location

            addLocation: (location) => set((state) => ({
                locations: [...state.locations, location]
            })),

            setLocations: (locations) => set({ locations }),

            fetchLocations: async () => {
                try {
                    const { getLocationsWithTerminals } = await import('@/actions/network');
                    const res = await getLocationsWithTerminals();
                    if (res.success && res.locations) {
                        set({ locations: res.locations });
                        // Also sync terminals if needed? Store mostly cares about locations logic for now
                        // But wait, the stores 'locations' type has 'associated_kiosks' (ids).
                        // The server action 'getLocationsWithTerminals' correctly maps terminals to 'associated_kiosks' ids.
                        // So the state is consistent.
                    }
                } catch (error) {
                    console.error('Failed to sync locations', error);
                }
            },

            updateLocation: (id, data) => set((state) => ({
                locations: state.locations.map(loc =>
                    loc.id === id ? { ...loc, ...data } : loc
                )
            })),

            switchLocation: (id, onSuccess) => {
                const target = get().locations.find(l => l.id === id);
                if (target) {
                    set({ currentLocation: target });
                    // 📍 Location switched
                    if (onSuccess) onSuccess();
                }
            },

            canSwitchLocation: (userRole) => {
                // MANAGER, ADMIN, and QF can switch freely
                // CASHIER and WAREHOUSE are locked to their assigned location
                return userRole === 'MANAGER' || userRole === 'ADMIN' || userRole === 'QF';
            },

            registerKiosk: (kiosk) => set((state) => ({
                kiosks: [...state.kiosks, kiosk]
            })),

            updateKioskStatus: (id, status) => set((state) => ({
                kiosks: state.kiosks.map(k =>
                    k.id === id ? { ...k, status } : k
                )
            })),

            generatePairingCode: (kioskId) => {
                // Simple mock generation
                const code = Math.random().toString(36).substring(2, 8).toUpperCase();
                // In a real app, we would save this code temporarily
                return code;
            }
        }),
        {
            name: 'location-storage-v2',
            version: 2,
            storage: createJSONStorage(() => localStorage),
        }
    )
);
