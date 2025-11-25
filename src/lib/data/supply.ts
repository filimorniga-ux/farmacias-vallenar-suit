import { query } from '@/lib/db';

export interface ProductSimple {
    id: number;
    nombre: string;
}

export async function getProducts(): Promise<ProductSimple[]> {
    try {
        const res = await query('SELECT id, nombre FROM productos WHERE activo = true ORDER BY nombre ASC');
        return res.rows;
    } catch (error) {
        console.error('Error fetching products:', error);
        return [];
    }
}

export interface Supplier {
    id: number;
    nombre_fantasia: string;
    rut: string;
    contacto_email: string;
    telefono: string;
}

export interface RestockingItem {
    producto_id: number;
    nombre: string;
    stock_actual: number;
    stock_minimo: number;
    sugerencia_pedido: number;
    proveedor_sugerido?: string;
}

export async function getSuppliers(): Promise<Supplier[]> {
    try {
        const res = await query('SELECT * FROM proveedores ORDER BY nombre_fantasia ASC');
        return res.rows;
    } catch (error) {
        console.error('Error fetching suppliers:', error);
        return [];
    }
}

export async function getRestockingSuggestions(): Promise<RestockingItem[]> {
    try {
        // 1. Get products with their total stock (sum of lots)
        // We use COALESCE to handle products with no lots (stock 0)
        const sql = `
      SELECT 
        p.id as producto_id,
        p.nombre,
        p.stock_minimo_seguridad,
        COALESCE(SUM(l.cantidad_disponible), 0) as stock_actual
      FROM productos p
      LEFT JOIN lotes l ON p.id = l.producto_id
      WHERE p.activo = true
      GROUP BY p.id, p.nombre, p.stock_minimo_seguridad
    `;

        const res = await query(sql);

        const suggestions: RestockingItem[] = [];

        res.rows.forEach((row: any) => {
            const stockActual = Number(row.stock_actual);
            const stockMinimo = Number(row.stock_minimo_seguridad) || 10; // Default 10 if null

            if (stockActual <= stockMinimo) {
                // Formula: (Min * 3) - Actual
                let sugerencia = (stockMinimo * 3) - stockActual;
                if (sugerencia < 0) sugerencia = 0;

                if (sugerencia > 0) {
                    suggestions.push({
                        producto_id: row.producto_id,
                        nombre: row.nombre,
                        stock_actual: stockActual,
                        stock_minimo: stockMinimo,
                        sugerencia_pedido: sugerencia,
                        proveedor_sugerido: 'Laboratorio Chile' // Mock default, could be dynamic
                    });
                }
            }
        });

        return suggestions.sort((a, b) => a.stock_actual - b.stock_actual); // Most critical first
    } catch (error) {
        console.error('Error calculating restocking suggestions:', error);
        return [];
    }
}

export async function receiveProduct(data: {
    producto_id: number;
    numero_lote: string;
    fecha_vencimiento: string;
    cantidad: number;
    ubicacion_fisica?: string;
}) {
    const sql = `
    INSERT INTO lotes (producto_id, numero_lote, fecha_vencimiento, cantidad_disponible, ubicacion_fisica)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
  `;
    const params = [
        data.producto_id,
        data.numero_lote,
        data.fecha_vencimiento,
        data.cantidad,
        data.ubicacion_fisica || 'Bodega Central'
    ];

    return await query(sql, params);
}
