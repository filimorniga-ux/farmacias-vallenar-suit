import { query } from '../db';

export interface PayrollData {
    totalSales: number;
    commissionableSales: number;
    nonCommissionableSales: number;
    totalCommissions: number;
}

export async function getPayrollData(): Promise<PayrollData> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // 1. Fetch all products to know which are commissionable
    // We need a map of product_id -> comisionable (boolean)
    const productsSql = `SELECT id, comisionable FROM productos`;
    const productsRes = await query(productsSql);

    const productMap = new Map<number, boolean>();
    productsRes.rows.forEach((row: any) => {
        productMap.set(row.id, row.comisionable);
    });

    // 2. Fetch all sales for the current month
    const salesSql = `
    SELECT items
    FROM ventas
    WHERE fecha >= $1
  `;
    const salesRes = await query(salesSql, [startOfMonth]);

    let totalSales = 0;
    let commissionableSales = 0;
    let nonCommissionableSales = 0;
    let totalCommissions = 0;

    const COMMISSION_RATE = 0.03; // 3%

    // 3. Iterate through sales and items
    salesRes.rows.forEach((sale: any) => {
        const items = sale.items; // JSONB array
        if (Array.isArray(items)) {
            items.forEach((item: any) => {
                const amount = Number(item.total) || 0;
                const productId = Number(item.producto_id);
                const isCommissionable = productMap.get(productId) || false;

                totalSales += amount;

                if (isCommissionable) {
                    commissionableSales += amount;
                    totalCommissions += Math.round(amount * COMMISSION_RATE);
                } else {
                    nonCommissionableSales += amount;
                }
            });
        }
    });

    return {
        totalSales,
        commissionableSales,
        nonCommissionableSales,
        totalCommissions,
    };
}
