import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SaleTransaction, LocationConfig, HardwareConfig } from '../../domain/types';
import TicketBoleta from '../components/printing/TicketBoleta';
import ShiftHandoverTicket from '../components/printing/ShiftHandoverTicket';
import { type HandoverSummary } from '@/actions/shift-handover-v2';
import { PrinterService } from '../../infrastructure/services/PrinterService';
import { toast } from 'sonner';

export const printSaleTicket = async (
    sale: SaleTransaction,
    locationConfig: LocationConfig | undefined,
    printerConfig: HardwareConfig,
    context?: { cashierName?: string; branchName?: string }
) => {
    return new Promise<void>((resolve) => {
        try {
            console.log('🖨️ Generating Print HTML...');

            // Yield to main thread to ensure UI is responsive before generating
            setTimeout(() => {
                // 1. Generate HTML from React Component
                // Determine template based on Sale or Quote logic
                let template = locationConfig?.templates?.SALE;
                if (sale.dte_status !== 'CONFIRMED_DTE') {
                    // Use RECEIPT template for non-fiscal documents
                    template = locationConfig?.templates?.RECEIPT || locationConfig?.templates?.SALE;
                }

                const ticketHtml = renderToStaticMarkup(
                    <TicketBoleta
                        sale={sale}
                        config={locationConfig?.receipt_template} // Legacy fallback
                        template={template}
                        cashierName={context?.cashierName}
                        branchName={context?.branchName}
                    />
                );

                // 2. Add wrapper for specific print width protection if needed, 
                // although PrinterService.injectStyles handles width on #print-area

                // 3. Send to Printer Service
                PrinterService.printTicket(ticketHtml, printerConfig);

                console.log('✅ Print job sent to browser');
                resolve();
            }, 50);

        } catch (error) {
            console.error('Error printing ticket:', error);
            toast.error('Error al generar impresión');
            resolve();
        }
    });
};

export const printHandoverTicket = async (
    summary: HandoverSummary,
    userName: string,
    terminalName: string,
    locationName: string,
    printerConfig: HardwareConfig,
    locationConfig?: LocationConfig // Added optional config
) => {
    return new Promise<void>((resolve) => {
        try {
            console.log('🖨️ Generating Shift Handover Ticket...');
            setTimeout(() => {
                const ticketHtml = renderToStaticMarkup(
                    <ShiftHandoverTicket
                        summary={summary}
                        userName={userName}
                        terminalName={terminalName}
                        locationName={locationName}
                        timestamp={new Date()}
                        template={locationConfig?.templates?.SHIFT_HANDOVER}
                    />
                );
                PrinterService.printTicket(ticketHtml, printerConfig);
                resolve();
            }, 50);
        } catch (error) {
            console.error('Error printing handover ticket:', error);
            toast.error('Error al imprimir ticket');
            resolve();
        }
    });
};
