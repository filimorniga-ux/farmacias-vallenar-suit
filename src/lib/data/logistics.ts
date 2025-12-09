import { query } from '../db';

export interface LogisticsItem {
  producto_id: string; // UUID
  sku: string;
  nombre: string;
  dci: string | null;
  categoria: string;
  condicion_venta: string;
  requiere_frio: boolean;
  lote_id: string; // UUID
  numero_lote: string;
  fecha_vencimiento: string; // ISO string
  cantidad_disponible: number;
  ubicacion_fisica: string | null;
  warehouse_id: string; // NEW
  estado: string;
}

export async function getLogisticsData(): Promise<LogisticsItem[]> {
  // Joined query to get product details + batch info
  const sql = `
    SELECT 
      ib.product_id,
      ib.sku,
      ib.name as nombre,
      p.active_ingredients as dci, -- Mapped from active_ingredients
      p.category as categoria,
      p.sales_condition as condicion_venta, -- e.g. 'RECETA_SIMPLE'
      p.requires_cold_chain as requiere_frio,
      ib.id as lote_id,
      ib.lot_number as numero_lote,
      ib.expiry_date as fecha_vencimiento,
      ib.quantity_real as cantidad_disponible,
      w.name as ubicacion_fisica, -- Use Warehouse Name as physical location proxy
      ib.warehouse_id
    FROM inventory_batches ib
    JOIN products p ON ib.product_id = p.id
    LEFT JOIN warehouses w ON ib.warehouse_id = w.id
    ORDER BY ib.expiry_date ASC
  `;

  try {
    const result = await query(sql);

    return result.rows.map((row: any) => ({
      ...row,
      producto_id: row.product_id, // Map for frontend compatibility
      lote_id: row.lote_id,
      sku: row.sku || '',
      dci: Array.isArray(row.dci) ? row.dci.join(', ') : (row.dci || ''), // Handle array DCI
      fecha_vencimiento: row.fecha_vencimiento ? new Date(row.fecha_vencimiento).toISOString() : new Date().toISOString(),
      estado: row.cantidad_disponible > 0 ? 'DISPONIBLE' : 'AGOTADO' // Compute simple status
    }));
  } catch (error) {
    console.error('Error fetching logistics data:', error);
    // Return empty array instead of crashing on query error during migration/dev
    return [];
  }
}
