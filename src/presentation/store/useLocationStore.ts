import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Location, KioskConfig } from '../../domain/types';
import { toast } from 'sonner';
import * as Sentry from '@sentry/nextjs';
import { safeLocalStorageStateStorage } from './indexedDBStorage';

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
    loadingSince?: number;

    registerKiosk: (kiosk: KioskConfig) => void;
    updateKioskStatus: (id: string, status: 'ACTIVE' | 'INACTIVE') => void;
    generatePairingCode: (kioskId: string) => string;
}

// Mock Initial Data - Removed to force fetch/clean state
const INITIAL_LOCATIONS: Location[] = [];

const INITIAL_KIOSKS: KioskConfig[] = [];
const CACHE_DURATION_MS = 5 * 60 * 1000;
const SYNC_TIMEOUT_MS = 90000;

export const useLocationStore = create<LocationState>()(
    persist(
        (set, get) => ({
            locations: INITIAL_LOCATIONS,
            kiosks: INITIAL_KIOSKS,
            currentLocation: null,

            addLocation: (location) => set((state) => ({
                locations: [...state.locations, location]
            })),

            setLocations: (locations) => set({ locations }),

            isLoading: false,
            lastFetch: 0,
            loadingSince: undefined,

            fetchLocations: async (force = false) => {
                const state = get() as any;
                const now = Date.now();
                const shouldUseCache = !force
                    && state.locations.length > 0
                    && typeof state.lastFetch === 'number'
                    && now - state.lastFetch < CACHE_DURATION_MS;

                if (shouldUseCache) {
                    return;
                }

                if (state.isLoading) {
                    console.log('📍 [LocationStore] Fetch already in progress, skipping.');
                    // Safety: If stuck for more than 20s, allow retry
                    if (now - (state.loadingSince || 0) > 20000) {
                        console.warn('📍 [LocationStore] Fetch seems stuck, resetting isLoading...');
                        set({ isLoading: false, loadingSince: undefined });
                    } else {
                        return;
                    }
                }

                set({ isLoading: true, loadingSince: now });

                // Safety Timeout (Extended for Cloud Latency / Dev Cold Start)
                const timeout = setTimeout(() => {
                    const currentState = get() as any;
                    if (currentState.isLoading) {
                        Sentry.captureMessage('[LocationStore] Sync timeout while fetching locations', {
                            level: 'warning',
                            tags: { module: 'LocationStore', action: 'fetchLocations' },
                            extra: { force, locationCount: currentState.locations?.length || 0 },
                        });
                        console.warn('📍 [LocationStore] Sync TIMEOUT after 90s - Retry advised');
                        toast.error('La sincronización de ubicaciones está tardando más de lo esperado. Por favor recargue si persiste.');
                        set({ isLoading: false, loadingSince: undefined });
                    }
                }, SYNC_TIMEOUT_MS);

                try {
                    const { usePharmaStore } = await import('./useStore'); // Import store to get user
                    const user = usePharmaStore.getState().user;

                    if (user) {
                        // Secure Fetch (Full Org Structure)
                        const { getOrganizationStructureSecure } = await import('@/actions/network-v2');
                        const res = await getOrganizationStructureSecure(user.id);

                        if (res.success && res.data?.locations) {
                            const newLocations = res.data.locations || [];

                            set(state => {
                                const updatedCurrentLocation = state.currentLocation
                                    ? newLocations.find(l => l.id === state.currentLocation?.id) || state.currentLocation
                                    : null;

                                return {
                                    locations: newLocations,
                                    currentLocation: updatedCurrentLocation,
                                    lastFetch: Date.now()
                                };
                            });
                        } else {
                            Sentry.captureMessage('[LocationStore] Secure fetch failed', {
                                level: 'error',
                                tags: { module: 'LocationStore', action: 'fetchLocations', mode: 'secure' },
                                extra: {
                                    error: res.error,
                                    code: (res as { code?: string }).code,
                                    correlationId: (res as { correlationId?: string }).correlationId,
                                },
                            });
                            toast.error(res.error || 'No fue posible sincronizar ubicaciones.');
                        }
                    } else {
                        // Public Fetch (Basic Locations for Context Selector)
                        const { getPublicLocationsSecure } = await import('@/actions/public-network-v2');
                        const res = await getPublicLocationsSecure();

                        if (res.success) {
                            set({
                                locations: res.data.map(l => ({
                                    ...l,
                                    associated_kiosks: [] // Default value for public fetch
                                })),
                                lastFetch: Date.now()
                            });
                        } else {
                            Sentry.captureMessage('[LocationStore] Public fetch failed', {
                                level: 'error',
                                tags: { module: 'LocationStore', action: 'fetchLocations', mode: 'public' },
                                extra: {
                                    error: res.error,
                                    code: (res as { code?: string }).code,
                                    correlationId: (res as { correlationId?: string }).correlationId,
                                },
                            });
                            toast.error(res.error || 'No fue posible cargar sucursales.');
                        }
                    }
                } catch (error: unknown) {
                    Sentry.captureException(error, {
                        tags: { module: 'LocationStore', action: 'fetchLocations' },
                        extra: { force },
                    });
                    toast.error('Error inesperado al sincronizar ubicaciones.');
                } finally {
                    clearTimeout(timeout);
                    set({ isLoading: false, loadingSince: undefined });
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
            storage: createJSONStorage(() => safeLocalStorageStateStorage),
            // EXCLUDE status fields from persistence to avoid "stuck" states on refresh
            partialize: (state) => ({
                locations: state.locations,
                currentLocation: state.currentLocation,
                kiosks: state.kiosks
            }),
        }
    )
);
