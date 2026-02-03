import { SaleTransaction, Expense, InventoryBatch, EmployeeProfile } from '../types';

export interface DateRange {
    from: Date;
    to: Date;
}

export interface FinancialMetrics {
    totalSales: number;
    totalExpenses: number;
    netProfit: number;
    grossMargin: number;
    transactionCount: number;
    averageTicket: number;
}

export interface TopProduct {
    sku: string;
    name: string;
    quantity: number;
    revenue: number;
}

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
        const paymentMethods = {
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
        const byCategory: Record<string, number> = {};

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
        const facturaExpenses = expenses.filter(e => e.document_type === 'FACTURA');
        const creditFiscal = Math.round(facturaExpenses.reduce((sum, e) => sum + e.amount, 0) * 0.19 / 1.19);

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
        let totalSocialLaws = 0;
        let totalCost = 0;

        employees.forEach(emp => {
            if (emp.status === 'ACTIVE') {
                const salary = emp.base_salary || 0;
                totalSalaries += salary;
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

    /**
     * Calculate comprehensive financial metrics for a date range
     */
    static calculateMetrics(
        sales: SaleTransaction[],
        expenses: Expense[],
        dateRange: DateRange
    ): FinancialMetrics {
        const filteredSales = this.filterByDateRange(sales, dateRange.from, dateRange.to);
        const filteredExpenses = this.filterByDateRange(expenses, dateRange.from, dateRange.to);

        const totalSales = filteredSales.reduce((sum, s) => sum + s.total, 0);
        const totalCost = filteredSales.reduce((sum, s) =>
            sum + s.items.reduce((itemSum, item) =>
                itemSum + (item.cost_price || 0) * item.quantity, 0
            ), 0
        );
        const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

        const grossProfit = totalSales - totalCost;
        const netProfit = grossProfit - totalExpenses;
        const grossMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

        return {
            totalSales,
            totalExpenses,
            netProfit,
            grossMargin,
            transactionCount: filteredSales.length,
            averageTicket: filteredSales.length > 0 ? totalSales / filteredSales.length : 0
        };
    }

    /**
     * Get top selling products
     */
    static getTopProducts(
        sales: SaleTransaction[],
        dateRange: DateRange,
        limit: number = 10
    ): TopProduct[] {
        const filteredSales = this.filterByDateRange(sales, dateRange.from, dateRange.to);
        const productMap = new Map<string, TopProduct>();

        filteredSales.forEach(sale => {
            sale.items.forEach(item => {
                const existing = productMap.get(item.sku);
                if (existing) {
                    existing.quantity += item.quantity;
                    existing.revenue += item.price * item.quantity;
                } else {
                    productMap.set(item.sku, {
                        sku: item.sku,
                        name: item.name,
                        quantity: item.quantity,
                        revenue: item.price * item.quantity
                    });
                }
            });
        });

        return Array.from(productMap.values())
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, limit);
    }

    /**
     * Get daily sales data for charts
     */
    static getDailySales(
        sales: SaleTransaction[],
        dateRange: DateRange
    ): Array<{ date: string; sales: number; transactions: number }> {
        const filteredSales = this.filterByDateRange(sales, dateRange.from, dateRange.to);
        const dailyMap = new Map<string, { sales: number; transactions: number }>();

        filteredSales.forEach(sale => {
            const date = new Date(sale.timestamp).toISOString().split('T')[0];
            const existing = dailyMap.get(date);
            if (existing) {
                existing.sales += sale.total;
                existing.transactions += 1;
            } else {
                dailyMap.set(date, { sales: sale.total, transactions: 1 });
            }
        });

        return Array.from(dailyMap.entries())
            .map(([date, data]) => ({ date, ...data }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    /**
     * Calculate inventory value
     */
    static calculateInventoryValue(inventory: InventoryBatch[]): number {
        return inventory.reduce((sum, item) =>
            sum + (item.cost_price * item.stock_actual), 0
        );
    }

    /**
     * Get low stock items
     */
    static getLowStockItems(inventory: InventoryBatch[]): InventoryBatch[] {
        return inventory.filter(item =>
            item.stock_actual <= item.stock_min && item.stock_actual > 0
        ).sort((a, b) =>
            (a.stock_actual / a.stock_min) - (b.stock_actual / b.stock_min)
        );
    }

    /**
     * Get expired or near-expiry items
     */
    static getExpiringItems(
        inventory: InventoryBatch[],
        daysThreshold: number = 30
    ): InventoryBatch[] {
        const now = Date.now();
        const threshold = now + (daysThreshold * 24 * 60 * 60 * 1000);

        return inventory.filter(item =>
            item.expiry_date && item.expiry_date <= threshold && item.expiry_date >= now
        ).sort((a, b) => (a.expiry_date || 0) - (b.expiry_date || 0));
    }
}
