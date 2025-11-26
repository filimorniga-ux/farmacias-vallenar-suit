import { SaleItem, SaleTransaction } from '../types';

export const ComplianceModule = {
    /**
     * Calcula la comisión para el vendedor según la Ley de Fármacos ("Anti-Canela").
     * Regla: Medicamentos = 0% comisión. Solo Retail/Belleza/Suplementos pueden tener comisión.
     */
    calculateCommission(item: SaleItem, employeeCommissionRate: number): number {
        if (!item.allows_commission) {
            return 0; // Ley Chilena: Prohibido incentivos por venta de medicamentos
        }
        return item.price * item.quantity * employeeCommissionRate;
    },

    /**
     * Genera la estructura de datos para el Documento Tributario Electrónico (Boleta).
     * Calcula Neto e IVA (19%).
     */
    generateDTEPayload(transaction: SaleTransaction) {
        const IVA_RATE = 0.19;

        // En Chile, los precios B2C suelen incluir IVA. Desglosamos hacia atrás.
        const totalGross = transaction.total;
        const netAmount = Math.round(totalGross / (1 + IVA_RATE));
        const taxAmount = totalGross - netAmount;

        return {
            encabezado: {
                tipo_dte: 39, // Boleta Electrónica
                fecha: new Date(transaction.timestamp).toISOString().split('T')[0],
                total: totalGross,
                emisor_rut: '76.123.456-7', // RUT Farmacia Mock
            },
            detalles: transaction.items.map((item, index) => ({
                nro_linea: index + 1,
                nombre: item.name,
                cantidad: item.quantity,
                precio_unitario: item.price,
                monto_item: item.price * item.quantity
            })),
            totales: {
                monto_neto: netAmount,
                monto_iva: taxAmount,
                monto_total: totalGross
            }
        };
    }
};
