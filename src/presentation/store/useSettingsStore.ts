import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { HardwareConfig } from '../../domain/types';

interface SettingsState {
    enable_sii_integration: boolean;
    toggleSiiIntegration: () => void;
    setSiiIntegration: (enabled: boolean) => void;

    // Hardware
    hardware: HardwareConfig;
    updateHardwareConfig: (config: Partial<HardwareConfig>) => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            enable_sii_integration: false, // Default to false as per requirements
            toggleSiiIntegration: () => set((state) => ({ enable_sii_integration: !state.enable_sii_integration })),
            setSiiIntegration: (enabled) => set({ enable_sii_integration: enabled }),

            // Hardware Defaults
            hardware: {
                pos_printer_width: '80mm',
                label_printer_size: '50x25',
                auto_print_pos: false,
                auto_print_labels: false,
                scanner_mode: 'KEYBOARD_WEDGE'
            },
            updateHardwareConfig: (config) => set((state) => ({
                hardware: { ...state.hardware, ...config }
            }))
        }),
        {
            name: 'settings-storage',
        }
    )
);
