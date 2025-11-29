import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Location, KioskConfig } from '../../domain/types';

interface LocationState {
    locations: Location[];
    kiosks: KioskConfig[];
    currentLocation: Location | null;

    // Actions
    addLocation: (location: Location) => void;
    updateLocation: (id: string, data: Partial<Location>) => void;
    switchLocation: (id: string, onSuccess?: () => void) => void;
    canSwitchLocation: (userRole: string) => boolean;

    registerKiosk: (kiosk: KioskConfig) => void;
    updateKioskStatus: (id: string, status: 'ACTIVE' | 'INACTIVE') => void;
    generatePairingCode: (kioskId: string) => string;
}

// Mock Initial Data - Extended with more locations
const INITIAL_LOCATIONS: Location[] = [
    {
        id: 'SUCURSAL_CENTRO',
        type: 'STORE',
        name: 'Farmacia Vallenar Centro',
        address: 'Arturo Prat 123, Vallenar',
        associated_kiosks: ['KIOSK-001']
    },
    {
        id: 'SUCURSAL_NORTE',
        type: 'STORE',
        name: 'Farmacia Vallenar Norte',
        address: 'Av. Brasil 456, Vallenar',
        associated_kiosks: ['KIOSK-002']
    },
    {
        id: 'SUCURSAL_SUR',
        type: 'STORE',
        name: 'Farmacia Vallenar Sur',
        address: 'Los Carrera 789, Vallenar',
        associated_kiosks: []
    },
    {
        id: 'BODEGA_CENTRAL',
        type: 'WAREHOUSE',
        name: 'Bodega Central Distribución',
        address: 'Ruta 5 Norte Km 600',
        associated_kiosks: []
    }
];

const INITIAL_KIOSKS: KioskConfig[] = [
    {
        id: 'KIOSK-001',
        type: 'QUEUE',
        location_id: 'SUCURSAL_CENTRO',
        status: 'ACTIVE'
    },
    {
        id: 'KIOSK-002',
        type: 'ATTENDANCE',
        location_id: 'SUCURSAL_NORTE',
        status: 'ACTIVE'
    }
];

export const useLocationStore = create<LocationState>()(
    persist(
        (set, get) => ({
            locations: INITIAL_LOCATIONS,
            kiosks: INITIAL_KIOSKS,
            currentLocation: INITIAL_LOCATIONS[0], // Default to Sucursal Centro

            addLocation: (location) => set((state) => ({
                locations: [...state.locations, location]
            })),

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
                // MANAGER and QF can switch freely
                // CASHIER and WAREHOUSE are locked to their assigned location
                return userRole === 'MANAGER' || userRole === 'QF';
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
