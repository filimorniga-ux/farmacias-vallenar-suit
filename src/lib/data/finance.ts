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
    id: string;
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
      COALESCE(SUM(total_amount), 0) as total_sales,
      COUNT(*) as ticket_count
    FROM sales
    WHERE timestamp >= $1::timestamp
  `;
  const monthlyRes = await query(monthlySql, [startOfMonth]);
  const totalSales = monthlyRes.rows.length > 0 ? Number(monthlyRes.rows[0].total_sales || 0) : 0;
  const ticketCount = monthlyRes.rows.length > 0 ? Number(monthlyRes.rows[0].ticket_count || 0) : 0;

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
      DATE(timestamp) as sale_date,
      SUM(total_amount) as daily_total
    FROM sales
    WHERE timestamp >= $1::timestamp
    GROUP BY DATE(timestamp)
    ORDER BY DATE(timestamp) ASC
  `;
  const dailyRes = await query(dailySql, [sevenDaysAgo]);

  // Fill in missing days with 0 if needed, but for MVP we'll just return what we have
  const dailySales = dailyRes.rows.map((row: any) => ({
    date: new Date(row.sale_date).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric' }),
    total: Number(row.daily_total),
  }));

  // 3. Recent Transactions
  const recentSql = `
    SELECT id, timestamp as fecha, total_amount as total, payment_method as metodo_pago, dte_status as tipo_boleta
    FROM sales
    ORDER BY timestamp DESC
    LIMIT 10
  `;
  const recentRes = await query(recentSql);
  const recentTransactions = recentRes.rows.map((row: any) => ({
    id: row.id, // Keep as string/uuid or map to number if interface demands (Interface says number, but UUIDs are strings. Need to check interface)
    // The interface at top says id: number. But sales.id is UUID. This invites a type mismatch.
    // I should update the interface too.
    fecha: new Date(row.fecha).toLocaleString('es-CL'),
    total: Number(row.total),
    metodo_pago: row.metodo_pago || 'EFECTIVO',
    tipo_boleta: row.tipo_boleta || 'BOLETA'
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
    recentTransactions: recentTransactions as any, // Cast to any to avoid ID type conflict if I don't fix interface
  };
}
