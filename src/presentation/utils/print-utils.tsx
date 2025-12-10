import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SaleTransaction, LocationConfig, HardwareConfig } from '../../domain/types';
import TicketBoleta from '../components/printing/TicketBoleta';
import { PrinterService } from '../../infrastructure/services/PrinterService';
import { toast } from 'sonner';

export const printSaleTicket = (
    sale: SaleTransaction,
    locationConfig: LocationConfig | undefined,
    printerConfig: HardwareConfig
) => {
    try {
        console.log('🖨️ Generating Print HTML...');

        // 1. Generate HTML from React Component
        const ticketHtml = renderToStaticMarkup(
            <TicketBoleta
                sale={sale}
                config={locationConfig?.receipt_template}
            />
        );

        // 2. Add wrapper for specific print width protection if needed, 
        // although PrinterService.injectStyles handles width on #print-area

        // 3. Send to Printer Service
        PrinterService.printTicket(ticketHtml, printerConfig);

        console.log('✅ Print job sent to browser');
    } catch (error) {
        console.error('Error printing ticket:', error);
        toast.error('Error al generar impresión');
    }
};
