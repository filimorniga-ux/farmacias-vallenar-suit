import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Location, KioskConfig } from '../../domain/types';
import { toast } from 'sonner';

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
    fetchLocations: (force?: boolean) => Promise<void>; // Sync with Backend
    isLoading?: boolean;
    lastFetch?: number;

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

            isLoading: false,
            lastFetch: Date.now(),

            fetchLocations: async (force = false) => {
                const state = get() as any;
                const now = Date.now();
                // Cache invalidation: 5 minutes
                const CACHE_DURATION = 5 * 60 * 1000;

                if (state.isLoading) {
                    console.log('📍 [LocationStore] Fetch already in progress, skipping.');
                    // Safety: If stuck for more than 20s, allow retry
                    if (now - (state.lastFetch || 0) > 20000) {
                        console.warn('📍 [LocationStore] Fetch seems stuck, resetting isLoading...');
                        set({ isLoading: false });
                    } else {
                        return;
                    }
                }

                set({ isLoading: true });

                // Safety Timeout (Extended for Cloud Latency / Dev Cold Start)
                const timeout = setTimeout(() => {
                    const currentState = get() as any;
                    if (currentState.isLoading) {
                        console.error('📍 [LocationStore] Sync TIMEOUT after 60s - Retry advised');
                        toast.error('La sincronización de ubicaciones está tardando más de lo esperado. Por favor recargue si persiste.');
                        set({ isLoading: false });
                    }
                }, 60000);

                try {
                    const { usePharmaStore } = await import('./useStore'); // Import store to get user
                    const user = usePharmaStore.getState().user;
                    console.log('📍 [LocationStore] Fetching locations...', user ? `(User: ${user.id})` : '(Public Mode)');

                    if (user) {
                        // Secure Fetch (Full Org Structure)
                        const { getOrganizationStructureSecure } = await import('@/actions/network-v2');
                        const res = await getOrganizationStructureSecure(user.id);
                        set({ isLoading: false, lastFetch: Date.now() });

                        if (res.success && res.data?.locations) {
                            const newLocations = res.data.locations || [];
                            console.log('📍 [LocationStore] Sync SUCCESS. Received config for:', newLocations.filter((l: any) => l.config).map((l: any) => l.name));

                            set(state => {
                                const updatedCurrentLocation = state.currentLocation
                                    ? newLocations.find(l => l.id === state.currentLocation?.id) || state.currentLocation
                                    : null;

                                return {
                                    locations: newLocations,
                                    currentLocation: updatedCurrentLocation
                                };
                            });
                        } else {
                            console.error('📍 [LocationStore] Secure fetch failed:', res.error);
                        }
                    } else {
                        // Public Fetch (Basic Locations for Context Selector)
                        const { getPublicLocationsSecure } = await import('@/actions/public-network-v2');
                        const res = await getPublicLocationsSecure();
                        set({ isLoading: false, lastFetch: Date.now() });

                        if (res.success && res.data) {
                            set({
                                locations: res.data.map(l => ({
                                    ...l,
                                    associated_kiosks: [] // Default value for public fetch
                                }))
                            });
                            console.log('📍 [LocationStore] Public locations updated:', res.data.length);
                        } else {
                            console.error('📍 [LocationStore] Public fetch failed:', res.error);
                        }
                    }
                } catch (error) {
                    console.error('Failed to sync locations', error);
                } finally {
                    clearTimeout(timeout);
                    set({ isLoading: false });
                }
            },

            updateLocation: (id, data) => set((state) => {
                const newLocations = state.locations.map(loc =>
                    loc.id === id ? { ...loc, ...data } : loc
                );

                // CRITICAL: Also update currentLocation if it matches the ID
                const newCurrentLocation = state.currentLocation?.id === id
                    ? { ...state.currentLocation, ...data }
                    : state.currentLocation;

                return {
                    locations: newLocations,
                    currentLocation: newCurrentLocation
                };
            }),

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
            // EXCLUDE status fields from persistence to avoid "stuck" states on refresh
            partialize: (state) => ({
                locations: state.locations,
                currentLocation: state.currentLocation,
                kiosks: state.kiosks
            }),
        }
    )
);
