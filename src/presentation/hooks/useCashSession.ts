import { useMemo } from 'react';
import { usePharmaStore } from '../store/useStore';
import { SaleTransaction, CashMovement } from '../../domain/types';

export const useCashSession = () => {
    const { currentShift, salesHistory, cashMovements } = usePharmaStore();

    const metrics = useMemo(() => {
        if (!currentShift) {
            return null;
        }

        // 1. Filter Data for Current Shift
        const shiftSales = salesHistory.filter(s =>
            s.timestamp >= currentShift.start_time &&
            (!currentShift.end_time || s.timestamp <= currentShift.end_time)
        );

        const shiftMovements = cashMovements.filter(m =>
            m.shift_id === currentShift.id
        );

        // 2. Process Sales by Method
        const cashSalesItems = shiftSales.filter(s => s.payment_method === 'CASH');
        const cardSalesItems = shiftSales.filter(s => s.payment_method === 'DEBIT' || s.payment_method === 'CREDIT');
        const transferSalesItems = shiftSales.filter(s => s.payment_method === 'TRANSFER');

        const cashSales = {
            count: cashSalesItems.length,
            total: cashSalesItems.reduce((sum, s) => sum + s.total, 0),
            items: cashSalesItems
        };

        const cardSales = {
            count: cardSalesItems.length,
            total: cardSalesItems.reduce((sum, s) => sum + s.total, 0),
            items: cardSalesItems
        };

        const transferSales = {
            count: transferSalesItems.length,
            total: transferSalesItems.reduce((sum, s) => sum + s.total, 0),
            items: transferSalesItems
        };

        const totalSales = shiftSales.reduce((sum, s) => sum + s.total, 0);

        // 3. Process Movements
        const inflows = shiftMovements.filter(m => m.type === 'IN' && m.is_cash);
        const outflows = shiftMovements.filter(m => m.type === 'OUT' && m.is_cash);

        const otherIncomes = {
            count: inflows.length,
            total: inflows.reduce((sum, m) => sum + m.amount, 0),
            items: inflows
        };

        const expenses = {
            count: outflows.length,
            total: outflows.reduce((sum, m) => sum + m.amount, 0),
            items: outflows
        };

        // 4. Calculate Theoretical Cash
        // Base + Ventas Efectivo + Otros Ingresos - Salidas
        const initialFund = currentShift.opening_amount;
        const expectedCash = initialFund + cashSales.total + otherIncomes.total - expenses.total;

        return {
            totalSales,
            cashSales,
            cardSales,
            transferSales,
            otherIncomes,
            expenses,
            initialFund,
            expectedCash
        };
    }, [currentShift, salesHistory, cashMovements]);

    return metrics;
};
