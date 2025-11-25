import { query } from '../db';

export interface LogisticsItem {
  producto_id: number;
  nombre: string;
  dci: string | null;
  categoria: string;
  condicion_venta: string;
  requiere_frio: boolean;
  lote_id: number;
  numero_lote: string;
  fecha_vencimiento: string; // ISO string from DB
  cantidad_disponible: number;
  ubicacion_fisica: string | null;
  estado: string;
}

export async function getLogisticsData(): Promise<LogisticsItem[]> {
  const sql = `
    SELECT 
      p.id as producto_id,
      p.nombre,
      p.dci,
      p.categoria,
      p.condicion_venta,
      p.requiere_frio,
      l.id as lote_id,
      l.numero_lote,
      l.fecha_vencimiento,
      l.cantidad_disponible,
      l.ubicacion_fisica,
      l.estado
    FROM productos p
    JOIN lotes l ON p.id = l.producto_id
    ORDER BY l.fecha_vencimiento ASC
  `;

  try {
    const result = await query(sql);
    // Convert date objects to ISO strings if necessary, though pg usually returns Date objects.
    // We'll map to ensure consistent types for the frontend.
    return result.rows.map((row: any) => ({
      ...row,
      fecha_vencimiento: new Date(row.fecha_vencimiento).toISOString(),
    }));
  } catch (error) {
    console.error('Error fetching logistics data:', error);
    throw new Error('Failed to fetch logistics data');
  }
}
