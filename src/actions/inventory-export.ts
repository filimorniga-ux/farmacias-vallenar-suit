'use server';

import { query } from '@/lib/db';
import ExcelJS from 'exceljs';

interface InventoryExportParams {
    startDate: string;
    endDate: string;
    sucursalId?: number; // Optional: Si no está, trae de todas
    bodegaId?: number | null; // Optional: Si no está, trae de todas (o de todas las de la sucursal)
    type?: 'kardex' | 'seed'; // Tipo de reporte
}

export async function exportInventoryReport(params: InventoryExportParams) {
    const { startDate, endDate, sucursalId, bodegaId, type = 'kardex' } = params;

    try {
        // 1. Obtener información de contexto (Nombres para el título)
        let bodegaNombre = 'TODAS';
        let sucursalNombre = 'TODAS';

        if (bodegaId) {
            const bodegaRes = await query('SELECT nombre FROM bodegas WHERE id = $1', [bodegaId]);
            if (bodegaRes.rows.length > 0) bodegaNombre = bodegaRes.rows[0].nombre;
        }

        if (sucursalId) {
            const sucursalRes = await query('SELECT nombre FROM sucursales WHERE id = $1', [sucursalId]);
            sucursalNombre = sucursalRes.rows[0]?.nombre || 'Desconocida';
        }

        // ==========================================
        // REPORTE: INVENTARIO SEMILLA (STOCK ACTUAL - CATÁLOGO COMPLETO)
        // ==========================================
        if (type === 'seed') {
            // Consulta a la tabla 'products' (Catálogo Maestro de 5000 productos)
            // Nota: Esta tabla usa UUIDs y esquema en inglés.

            const queryParams: any[] = [];
            let filterConditions = '';

            // Nota: La tabla products no tiene sucursal/bodega directa (es maestro).
            // Si se filtra, teóricamente deberíamos filtrar por stock en esa ubicación,
            // pero 'products' tiene 'stock_total' global o 'location_id'.
            // Por ahora, devolvemos todo el catálogo, ya que el usuario pidió "el inventario con los casi 5000 productos".

            // Intentamos obtener columnas que sabemos existen por sync.ts
            // Usamos COALESCE para manejar nulos.
            const stockQuery = `
                SELECT 
                    id,
                    sku,
                    name as nombre,
                    category as categoria,
                    stock_total as stock_actual,
                    'N/A' as numero_lote, -- La tabla products no tiene lotes detallados
                    'N/A' as fecha_vencimiento, -- La tabla products no tiene vencimiento
                    location_id as bodega_nombre -- Usamos location_id como referencia
                FROM products
                ORDER BY name ASC
            `;

            const stockRes = await query(stockQuery, queryParams);

            // Generar Excel
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Inventario Semilla');

            // Encabezado Visual
            sheet.mergeCells('A1:H1');
            sheet.getCell('A1').value = `INVENTARIO MAESTRO (5000 ITEMS) - ${sucursalNombre}`;
            sheet.getCell('A1').font = { bold: true, size: 14 };
            sheet.getCell('A1').alignment = { horizontal: 'center' };

            sheet.mergeCells('A2:H2');
            sheet.getCell('A2').value = `Fecha de corte: ${new Date().toLocaleString()}`;
            sheet.getCell('A2').alignment = { horizontal: 'center' };

            // Estilos
            const headerStyle = {
                font: { bold: true, color: { argb: 'FFFFFFFF' } },
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } } as ExcelJS.Fill,
                alignment: { horizontal: 'center' } as Partial<ExcelJS.Alignment>
            };

            // Columnas
            sheet.getRow(4).values = [
                'SKU', 'Producto', 'Categoría', 'Lote', 'Vencimiento', 'Stock Total', 'Ubicación', 'ID Sistema'
            ];
            sheet.getRow(4).eachCell(cell => cell.style = headerStyle);

            // Datos
            stockRes.rows.forEach(row => {
                sheet.addRow([
                    row.sku || 'S/N',
                    row.nombre,
                    row.categoria || 'GENERAL',
                    row.numero_lote,
                    row.fecha_vencimiento,
                    Number(row.stock_actual || 0),
                    row.bodega_nombre || 'General',
                    row.id // UUID
                ]);
            });

            // Ajuste de anchos
            sheet.columns.forEach(col => { col.width = 15; });
            sheet.getColumn(2).width = 40; // Producto
            sheet.getColumn(8).width = 35; // UUID

            const buffer = await workbook.xlsx.writeBuffer();
            return {
                success: true,
                data: Buffer.from(buffer).toString('base64'),
                filename: `Inventario_Maestro_Completo_${new Date().toISOString().split('T')[0]}.xlsx`
            };
        }

        // ==========================================
        // REPORTE: KARDEX (MOVIMIENTOS)
        // ==========================================

        let movQuery = `
            SELECT 
                m.id,
                m.fecha,
                m.tipo_movimiento,
                m.cantidad,
                m.producto_id,
                p.nombre as producto_nombre,
                l.numero_lote,
                l.fecha_vencimiento,
                b.nombre as bodega_nombre,
                s.nombre as sucursal_nombre,
                m.usuario_id,
                m.observacion
            FROM movimientos_inventario m
            JOIN productos p ON m.producto_id = p.id
            LEFT JOIN lotes l ON m.lote_id = l.id
            JOIN bodegas b ON m.bodega_id = b.id
            JOIN sucursales s ON b.sucursal_id = s.id
            WHERE m.fecha >= $1 AND m.fecha <= $2
        `;

        // Ajustamos endDate para incluir todo el día
        const endDayParams = new Date(endDate);
        endDayParams.setHours(23, 59, 59, 999);

        const movParams: any[] = [startDate, endDayParams.toISOString()];

        if (sucursalId) {
            movQuery += ` AND b.sucursal_id = $${movParams.length + 1}`;
            movParams.push(sucursalId);
        }

        if (bodegaId) {
            movQuery += ` AND m.bodega_id = $${movParams.length + 1}`;
            movParams.push(bodegaId);
        }

        movQuery += ` ORDER BY m.fecha ASC`;

        const movRes = await query(movQuery, movParams);

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Kardex de Movimientos');

        sheet.mergeCells('A1:J1');
        sheet.getCell('A1').value = `REPORTE DE MOVIMIENTOS (KARDEX) - ${sucursalNombre} - ${bodegaNombre}`;
        sheet.getCell('A1').font = { bold: true, size: 14 };
        sheet.getCell('A1').alignment = { horizontal: 'center' };

        sheet.mergeCells('A2:J2');
        sheet.getCell('A2').value = `Desde: ${startDate}  Hasta: ${endDate}`;
        sheet.getCell('A2').alignment = { horizontal: 'center' };

        const headerKeyStyle = {
            font: { bold: true, color: { argb: 'FFFFFFFF' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } } as ExcelJS.Fill,
            alignment: { horizontal: 'center' } as Partial<ExcelJS.Alignment>
        };

        sheet.getRow(4).values = [
            'Fecha', 'Sucursal', 'Bodega', 'Tipo Movimiento', 'ID (SKU)', 'Producto', 'Lote', 'Vencimiento', 'Entrada', 'Salida', 'Observación'
        ];
        sheet.getRow(4).eachCell(cell => cell.style = headerKeyStyle);

        movRes.rows.forEach(mov => {
            const esEntrada = ['ENTRADA_COMPRA', 'AJUSTE_POSITIVO', 'TRASPASO_ENTRADA'].includes(mov.tipo_movimiento);

            sheet.addRow([
                new Date(mov.fecha).toLocaleString(),
                mov.sucursal_nombre,
                mov.bodega_nombre,
                mov.tipo_movimiento,
                mov.producto_id,
                mov.producto_nombre,
                mov.numero_lote || '---',
                mov.fecha_vencimiento ? new Date(mov.fecha_vencimiento).toLocaleDateString() : '---',
                esEntrada ? Number(mov.cantidad) : 0,  // Columna Entrada
                !esEntrada ? Number(mov.cantidad) : 0, // Columna Salida
                mov.observacion || ''
            ]);
        });

        sheet.columns.forEach(col => { col.width = 15; });
        sheet.getColumn(6).width = 35; // Producto
        sheet.getColumn(2).width = 20;
        sheet.getColumn(3).width = 20;
        sheet.getColumn(4).width = 20;

        const buffer = await workbook.xlsx.writeBuffer();

        return {
            success: true,
            data: Buffer.from(buffer).toString('base64'),
            filename: `Kardex_Movimientos_${startDate}_${endDate}.xlsx`
        };

    } catch (error: any) {
        console.error('Error generando reporte:', error);
        return { success: false, error: error.message || String(error) };
    }
}

export async function getSucursales() {
    try {
        const res = await query('SELECT id, nombre FROM sucursales WHERE activo = true');
        return res.rows;
    } catch (error) {
        return [];
    }
}

export async function getBodegas(sucursalId?: number) {
    try {
        let sql = 'SELECT id, nombre FROM bodegas WHERE activo = true';
        const params: any[] = [];

        if (sucursalId) {
            sql += ' AND sucursal_id = $1';
            params.push(sucursalId);
        }

        const res = await query(sql, params);
        return res.rows;
    } catch (error) {
        return [];
    }
}
