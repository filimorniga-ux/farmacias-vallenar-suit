import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Role = 'ADMIN' | 'QF' | 'VENDEDOR' | 'GERENTE_GENERAL' | 'MANAGER';

interface User {
    id: number;
    username: string;
    role: Role;
}

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    role: Role | null;
    hasHydrated: boolean;
    login: (user: User) => void;
    logout: () => void;
    setHasHydrated: (state: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            isAuthenticated: false,
            role: null,
            hasHydrated: false,
            login: (user) => set({ user, isAuthenticated: true, role: user.role }),
            logout: () => set({ user: null, isAuthenticated: false, role: null }),
            setHasHydrated: (state) => set({ hasHydrated: state }),
        }),
        {
            name: 'farmacias-vallenar-auth',
            onRehydrateStorage: () => (state) => {
                state?.setHasHydrated(true);
            },
        }
    )
);
