import { SaleTransaction, CashMovement, QueueTicket, PrinterConfig } from '../types';

export class PrinterService {
    static async printTicket(sale: SaleTransaction, config: PrinterConfig) {
        if (!config.auto_print_sale) return;

        console.log('🖨️ PRINTING TICKET:', sale.id);
        console.log('HEADER:', config.header_text);
        console.log('ITEMS:', sale.items.length);
        console.log('FOOTER:', config.footer_text);

        // In a real app, this would talk to a thermal printer API (WebUSB, QZ Tray, etc.)
        // For now, we simulate with a window alert or just console
        // alert(`🖨️ Imprimiendo Boleta #${sale.id}`);

        // Check for fractional items and print labels (Art. 40 B)
        const fractionalItems = sale.items.filter(item => item.is_fractional);
        if (fractionalItems.length > 0) {
            console.log('✂️ DETECTED FRACTIONAL ITEMS:', fractionalItems.length);
            fractionalItems.forEach(item => {
                this.printFractionalLabel(item, config);
            });
        }
    }

    static async printFractionalLabel(item: any, config: PrinterConfig) {
        console.log('🏷️ PRINTING LABEL (ART 40 B):', item.name);
        console.log('   Pac: ', item.original_name);
        console.log('   Cant:', item.quantity);
        console.log('   QF Supervisor: Javiera Rojas (DT)'); // Mocked for now, should come from store
        console.log('   Registro ISP: F-2244/19'); // Mocked, should come from item
        console.log('   "Para mayor información consulte a su prescriptor o farmacéutico."');
        // Simulate label printing
    }

    static async printVoucher(movement: CashMovement, config: PrinterConfig) {
        if (!config.auto_print_cash) return;

        console.log('🖨️ PRINTING VOUCHER:', movement.id);
        console.log('TYPE:', movement.type);
        console.log('AMOUNT:', movement.amount);

        // alert(`🖨️ Imprimiendo Comprobante de ${movement.type}`);
    }

    static async printQueueTicket(ticket: QueueTicket, config: PrinterConfig) {
        if (!config.auto_print_queue) return;

        console.log('🖨️ PRINTING QUEUE TICKET:', ticket.number);
        console.log('BRANCH:', ticket.branch_id);

        // alert(`🖨️ Imprimiendo Turno ${ticket.number}`);
    }
}
