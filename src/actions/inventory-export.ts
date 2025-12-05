'use server';

import { query } from '@/lib/db';
import ExcelJS from 'exceljs';

interface InventoryExportParams {
    startDate: string;
    endDate: string;
    sucursalId: number;
    bodegaId: number;
}

export async function exportInventoryReport(params: InventoryExportParams) {
    const { startDate, endDate, sucursalId, bodegaId } = params;

    try {
        // 1. Obtener datos de la bodega y sucursal para el encabezado
        const bodegaRes = await query(
            `SELECT b.nombre as bodega, s.nombre as sucursal 
             FROM bodegas b 
             JOIN sucursales s ON b.sucursal_id = s.id 
             WHERE b.id = $1`,
            [bodegaId]
        );
        const bodegaInfo = bodegaRes.rows[0];

        // 2. Obtener Movimientos (Kardex)
        // Esta query obtiene el saldo inicial antes de la fecha de inicio
        // y luego los movimientos dentro del rango.
        // NOTA: Para simplificar, en esta primera versión traeremos los movimientos y calcularemos en memoria o SQL.

        // Query para obtener movimientos detallados
        const movimientosSql = `
            SELECT 
                m.fecha,
                m.tipo_movimiento,
                p.nombre as producto,
                p.dci,
                l.numero_lote,
                l.fecha_vencimiento,
                m.cantidad,
                m.observacion,
                m.usuario_id
            FROM movimientos_inventario m
            JOIN productos p ON m.producto_id = p.id
            JOIN lotes l ON m.lote_id = l.id
            WHERE m.bodega_id = $1
            AND m.fecha >= $2
            AND m.fecha <= $3
            ORDER BY m.fecha ASC
        `;

        const movimientosRes = await query(movimientosSql, [bodegaId, startDate, endDate]);
        const movimientos = movimientosRes.rows;

        // 3. Generar Excel
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Kardex Inventario');

        // Estilos
        const headerStyle = {
            font: { bold: true, size: 12 },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } } as ExcelJS.Fill,
            alignment: { horizontal: 'center' } as Partial<ExcelJS.Alignment>
        };

        // Encabezado del Reporte
        worksheet.mergeCells('A1:H1');
        worksheet.getCell('A1').value = `REPORTE DE KARDEX - ${bodegaInfo.sucursal} - ${bodegaInfo.bodega}`;
        worksheet.getCell('A1').font = { bold: true, size: 14 };
        worksheet.getCell('A1').alignment = { horizontal: 'center' };

        worksheet.mergeCells('A2:H2');
        worksheet.getCell('A2').value = `Rango: ${startDate} al ${endDate}`;
        worksheet.getCell('A2').alignment = { horizontal: 'center' };

        // Encabezados de Tabla
        worksheet.getRow(4).values = [
            'Fecha', 'Tipo Movimiento', 'Producto', 'DCI', 'Lote', 'Vencimiento', 'Cantidad', 'Usuario'
        ];

        worksheet.getRow(4).eachCell((cell) => {
            cell.style = headerStyle;
        });

        // Datos
        movimientos.forEach((mov) => {
            worksheet.addRow([
                new Date(mov.fecha).toLocaleString(),
                mov.tipo_movimiento,
                mov.producto,
                mov.dci,
                mov.numero_lote,
                new Date(mov.fecha_vencimiento).toLocaleDateString(),
                mov.cantidad,
                mov.usuario_id
            ]);
        });

        // Ajustar ancho de columnas
        worksheet.columns = [
            { width: 20 }, // Fecha
            { width: 20 }, // Tipo
            { width: 30 }, // Producto
            { width: 20 }, // DCI
            { width: 15 }, // Lote
            { width: 15 }, // Vencimiento
            { width: 10 }, // Cantidad
            { width: 15 }, // Usuario
        ];

        // Buffer
        const buffer = await workbook.xlsx.writeBuffer();

        // Retornar como base64 para que el cliente lo descargue
        return {
            success: true,
            data: Buffer.from(buffer).toString('base64'),
            filename: `kardex_${bodegaInfo.bodega}_${startDate}_${endDate}.xlsx`
        };

    } catch (error) {
        console.error('Error generando reporte:', error);
        return { success: false, error: 'Error al generar el reporte' };
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

export async function getBodegas(sucursalId: number) {
    try {
        const res = await query('SELECT id, nombre FROM bodegas WHERE sucursal_id = $1 AND activo = true', [sucursalId]);
        return res.rows;
    } catch (error) {
        return [];
    }
}
