import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { HardwareConfig } from '../../domain/types';
import { safeLocalStorageStateStorage } from './indexedDBStorage';
import { brand } from '@/config/brand.config';

interface SettingsState {
    // Hardware
    hardware: HardwareConfig;
    updateHardwareConfig: (config: Partial<HardwareConfig>) => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
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
                ticket_company_name: brand.companyShortName,
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
            }))
        }),
        {
            name: 'settings-storage',
            storage: createJSONStorage(() => safeLocalStorageStateStorage),
        }
    )
);
