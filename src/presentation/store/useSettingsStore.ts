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

    // Security
    security: {
        idle_timeout_minutes: number;
        max_login_attempts: number;
        lockout_duration_minutes: number;
    };
    updateSecurityConfig: (config: Partial<{
        idle_timeout_minutes: number;
        max_login_attempts: number;
        lockout_duration_minutes: number;
    }>) => void;
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
            })),

            // Security Defaults
            security: {
                idle_timeout_minutes: 5,
                max_login_attempts: 5,
                lockout_duration_minutes: 15
            },
            updateSecurityConfig: (config) => set((state) => ({
                security: { ...state.security, ...config }
            }))
        }),
        {
            name: 'settings-storage',
        }
    )
);
