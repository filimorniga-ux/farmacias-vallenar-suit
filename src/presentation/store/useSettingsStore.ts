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
                scanner_mode: 'KEYBOARD_WEDGE',
                // Printer Device Selection
                pos_printer_name: undefined,
                label_printer_name: undefined,
                document_printer_name: undefined,
                // Company Info
                ticket_company_name: 'Farmacia Vallenar',
                ticket_company_rut: '76.123.456-7',
                ticket_company_address: 'Av. Matta 123, Vallenar',
                ticket_company_phone: '+56 9 1234 5678',
                ticket_company_giro: 'Venta al por menor de productos farmacéuticos',
                ticket_logo_base64: undefined,
                // Messages
                ticket_header_message: undefined,
                ticket_footer_message: '¡Gracias por su preferencia!',
                ticket_promo_message: undefined,
                ticket_social_media: '@farmaciasvallenar',
                // Features
                ticket_show_loyalty_points: true,
                ticket_show_savings: true,
                ticket_show_cashier_name: true,
                ticket_show_barcode: true
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
