
import { SaleItem, EmployeeProfile } from '../types';

const IVA_RATE = 0.19;
const GRATIFICACION_RATE = 0.0475;
const AFP_HEALTH_TAX_RATE = 0.20;

export const Compliance = {

    // Lógica ANTI-CANELA (Ley de Fármacos II)
    calculateCommissions(sales: SaleItem[]): { totalCommissionable: number; totalNonCommissionable: number; commission: number } {
        let totalCommissionable = 0;
        let totalNonCommissionable = 0;
        const COMMISSION_PERCENT = 0.05;

        sales.forEach(item => {
            const totalItemValue = item.price * item.quantity;
            if (item.isCommissionable) {
                totalCommissionable += totalItemValue;
            } else {
                totalNonCommissionable += totalItemValue;
            }
        });

        return {
            totalCommissionable,
            totalNonCommissionable,
            commission: totalCommissionable * COMMISSION_PERCENT,
        };
    },

    // Simulación de Liquidación de Sueldo (Chile)
    calculateChileanPayroll(profile: EmployeeProfile, grossSalesValue: number): { base: number; gross: number; commission: number; deductions: number; net: number } {
        const IMM_MONTHLY = 460000;
        const { commission } = Compliance.calculateCommissions([{
            itemId: 'mock',
            name: 'Ventas Totales',
            price: grossSalesValue,
            quantity: 1,
            isCommissionable: profile.role === 'VENDEDOR'
        } as SaleItem]);

        const legalGratification = Math.min(profile.baseSalary * GRATIFICACION_RATE, IMM_MONTHLY * 4.75 / 12);

        const taxableGross = profile.baseSalary + legalGratification + commission;
        const totalDeductions = taxableGross * AFP_HEALTH_TAX_RATE;
        const netSalary = taxableGross - totalDeductions;

        return {
            base: profile.baseSalary,
            gross: taxableGross,
            commission,
            deductions: totalDeductions,
            net: netSalary,
        };
    },

    // Simulación de Payload para SII (DTE - Documento Tributario Electrónico)
    generateDTEPayload(saleItems: SaleItem[], total: number, rut: string): any {
        const net = total / (1 + IVA_RATE);
        const iva = total - net;

        return {
            Encabezado: {
                TipoDTE: 39,
                RUTEmisor: '76.xxx.xxx-K',
                RUTReceptor: rut === '66666666-6' ? '66666666-6' : rut,
                MontoNeto: Math.round(net),
                MontoIVA: Math.round(iva),
                MontoTotal: Math.round(total),
            },
            Detalle: saleItems.map(item => ({
                NmbItem: item.name,
                QtyItem: item.quantity,
                PrcItem: item.price,
            })),
            TimbreDigital: 'MOCK_QR_CODE_SII_VALIDADO',
        };
    }
};
