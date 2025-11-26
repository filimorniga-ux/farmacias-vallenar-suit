import { SaleTransaction, Expense, InventoryBatch, EmployeeProfile } from '../types';

export class FinancialService {

    static filterByDateRange<T extends { date?: number; timestamp?: number }>(
        items: T[],
        start: Date,
        end: Date
    ): T[] {
        const startTime = start.getTime();
        const endTime = end.getTime();
        return items.filter(item => {
            const time = item.date || item.timestamp || 0;
            return time >= startTime && time <= endTime;
        });
    }

    static getSalesSummary(sales: SaleTransaction[]) {
        let grossSales = 0;
        let netSales = 0; // Ventas menos IVA (aprox 19%)
        let paymentMethods = {
            CASH: 0,
            DEBIT: 0,
            CREDIT: 0,
            TRANSFER: 0
        };

        sales.forEach(sale => {
            grossSales += sale.total;
            paymentMethods[sale.payment_method] = (paymentMethods[sale.payment_method] || 0) + sale.total;
        });

        netSales = Math.round(grossSales / 1.19);

        return {
            grossSales,
            netSales,
            paymentMethods
        };
    }

    static getExpensesSummary(expenses: Expense[]) {
        let totalExpenses = 0;
        let deductibleExpenses = 0;
        let nonDeductibleExpenses = 0;
        let byCategory: Record<string, number> = {};

        expenses.forEach(expense => {
            totalExpenses += expense.amount;
            if (expense.is_deductible) {
                deductibleExpenses += expense.amount;
            } else {
                nonDeductibleExpenses += expense.amount;
            }
            byCategory[expense.category] = (byCategory[expense.category] || 0) + expense.amount;
        });

        return {
            totalExpenses,
            deductibleExpenses,
            nonDeductibleExpenses,
            byCategory
        };
    }

    static calculateEBITDA(grossSales: number, totalExpenses: number) {
        // Simplificación: EBITDA = Ventas - Gastos (sin considerar depreciación/amortización por ahora)
        return grossSales - totalExpenses;
    }

    static getTaxCompliance(sales: SaleTransaction[], expenses: Expense[], ppmRate: number = 0.015) {
        const salesSummary = this.getSalesSummary(sales);
        const expensesSummary = this.getExpensesSummary(expenses);

        const debitFiscal = salesSummary.grossSales - salesSummary.netSales; // IVA Ventas
        // Asumimos que el 100% de los gastos deducibles tienen IVA recuperable para simplificar, 
        // o deberíamos filtrar solo facturas de compra.
        // Refinamiento: Solo gastos con document_type === 'FACTURA' generan crédito fiscal.
        const facturaExpenses = expenses.filter(e => e.document_type === 'FACTURA');
        const creditFiscal = Math.round(facturaExpenses.reduce((sum, e) => sum + e.amount, 0) * 0.19 / 1.19); // Extraer IVA de monto bruto

        const ivaToPay = Math.max(0, debitFiscal - creditFiscal);
        const ppm = Math.round(salesSummary.netSales * ppmRate);

        return {
            debitFiscal,
            creditFiscal,
            ivaToPay,
            ppm,
            nonDeductibleWarning: expensesSummary.nonDeductibleExpenses
        };
    }

    static getLaborCosts(employees: EmployeeProfile[]) {
        let totalSalaries = 0;
        let totalSocialLaws = 0; // Aprox 20% sobre imponible (simplificado)
        let totalCost = 0;

        employees.forEach(emp => {
            if (emp.status === 'ACTIVE') {
                const salary = emp.base_salary || 0;
                totalSalaries += salary;
                // Estimación costo empresa: Sueldo Líquido + ~20-25% leyes sociales
                // Aquí usamos base_salary como "Sueldo Base Imponible"
                const socialLaws = Math.round(salary * 0.22);
                totalSocialLaws += socialLaws;
                totalCost += salary + socialLaws;
            }
        });

        return {
            totalSalaries,
            totalSocialLaws,
            totalCost
        };
    }
}
