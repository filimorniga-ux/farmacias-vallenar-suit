import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeBrowserStateStorage } from './safePersistStorage';

export type UserRole = 'ADMIN' | 'QUIMICO' | 'VENDEDOR';

interface User {
    username: string;
    role: UserRole;
    name: string;
}

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    login: (user: User) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            isAuthenticated: false,
            login: (user) => set({ user, isAuthenticated: true }),
            logout: () => set({ user: null, isAuthenticated: false }),
        }),
        {
            name: 'auth-storage',
            storage: createJSONStorage(() => safeBrowserStateStorage),
        }
    )
);
