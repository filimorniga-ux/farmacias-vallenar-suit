import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
    enable_sii_integration: boolean;
    toggleSiiIntegration: () => void;
    setSiiIntegration: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            enable_sii_integration: false, // Default to false as per requirements
            toggleSiiIntegration: () => set((state) => ({ enable_sii_integration: !state.enable_sii_integration })),
            setSiiIntegration: (enabled) => set({ enable_sii_integration: enabled }),
        }),
        {
            name: 'settings-storage',
        }
    )
);
