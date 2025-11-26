import { SaleTransaction } from '../types';

export type DteGenerationResult = {
    shouldGenerate: boolean;
    status: 'CONFIRMED_DTE' | 'FISCALIZED_BY_VOUCHER';
    message: string;
};

export const shouldGenerateDTE = (paymentMethod: SaleTransaction['payment_method']): DteGenerationResult => {
    if (paymentMethod === 'CASH' || paymentMethod === 'TRANSFER') {
        return {
            shouldGenerate: true,
            status: 'CONFIRMED_DTE',
            message: 'Generando Boleta Electrónica (SII)'
        };
    } else {
        // DEBIT or CREDIT
        return {
            shouldGenerate: false,
            status: 'FISCALIZED_BY_VOUCHER',
            message: 'Venta fiscalizada mediante Voucher (Transbank/Getnet)'
        };
    }
};
