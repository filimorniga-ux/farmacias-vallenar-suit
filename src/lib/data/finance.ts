import { query } from '../db';

export interface FinanceData {
  monthlyStats: {
    totalSales: number;
    ticketCount: number;
    averageTicket: number;
    netSales: number;
    ivaDebit: number; // F29 Estimate
  };
  dailySales: {
    date: string;
    total: number;
  }[];
  recentTransactions: {
    id: number;
    fecha: string;
    total: number;
    metodo_pago: string;
    tipo_boleta: string;
  }[];
}

export async function getFinanceData(): Promise<FinanceData> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Monthly Totals
  const monthlySql = `
    SELECT 
      COALESCE(SUM(total), 0) as total_sales,
      COUNT(*) as ticket_count
    FROM ventas
    WHERE fecha >= $1
  `;
  const monthlyRes = await query(monthlySql, [startOfMonth]);
  const totalSales = monthlyRes.rows.length > 0 ? parseInt(monthlyRes.rows[0].total_sales || '0') : 0;
  const ticketCount = monthlyRes.rows.length > 0 ? parseInt(monthlyRes.rows[0].ticket_count || '0') : 0;

  // Tax Calculations (Chilean F29)
  // Total = Net + IVA (19%)
  // Net = Total / 1.19
  // IVA = Total - Net
  const netSales = Math.round(totalSales / 1.19);
  const ivaDebit = totalSales - netSales;
  const averageTicket = ticketCount > 0 ? Math.round(totalSales / ticketCount) : 0;

  // 2. Daily Sales (Last 7 Days)
  const dailySql = `
    SELECT 
      DATE(fecha) as sale_date,
      SUM(total) as daily_total
    FROM ventas
    WHERE fecha >= $1
    GROUP BY DATE(fecha)
    ORDER BY DATE(fecha) ASC
  `;
  const dailyRes = await query(dailySql, [sevenDaysAgo]);

  // Fill in missing days with 0 if needed, but for MVP we'll just return what we have
  const dailySales = dailyRes.rows.map((row: any) => ({
    date: new Date(row.sale_date).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric' }),
    total: parseInt(row.daily_total),
  }));

  // 3. Recent Transactions
  const recentSql = `
    SELECT id, fecha, total, metodo_pago, tipo_boleta
    FROM ventas
    ORDER BY fecha DESC
    LIMIT 10
  `;
  const recentRes = await query(recentSql);
  const recentTransactions = recentRes.rows.map((row: any) => ({
    ...row,
    fecha: new Date(row.fecha).toLocaleString('es-CL'),
  }));

  return {
    monthlyStats: {
      totalSales,
      ticketCount,
      averageTicket,
      netSales,
      ivaDebit,
    },
    dailySales,
    recentTransactions,
  };
}
