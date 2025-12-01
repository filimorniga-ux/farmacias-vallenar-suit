'use server';

import { query } from '../lib/db';
import { InventoryBatch, EmployeeProfile } from '../domain/types';

export async function fetchInventory(): Promise<InventoryBatch[]> {
    console.log('Fetching inventory from DB...');
    try {
        const res = await query('SELECT * FROM products');
        console.log(`✅ Fetched ${res.rows.length} products from DB`);

        // Map DB columns to Domain Type
        // Assuming DB columns might be snake_case or slightly different. 
        // We map what we can and default the rest for safety.
        return res.rows.map((row: any) => ({
            id: row.id?.toString() || `PROD-${Math.random()}`,
            sku: row.sku || row.codigo || 'UNKNOWN',
            name: row.nombre || row.name || 'Sin Nombre',
            dci: row.dci || row.principio_activo || '',
            laboratory: row.laboratory || row.laboratorio || 'GENERICO',
            isp_register: row.isp_register || row.registro_isp || '',
            format: row.format || row.formato || 'CAJA',
            units_per_box: Number(row.units_per_box || row.unidades_por_caja) || 1,
            is_bioequivalent: row.is_bioequivalent || row.es_bioequivalente || false,

            // Legacy / Optional / Derived defaults
            concentration: row.concentration || '',
            unit_count: Number(row.unit_count) || 1,
            is_generic: row.is_generic || false,
            bioequivalent_status: (row.bioequivalent_status || 'NO_BIOEQUIVALENTE') as any,

            // Financials
            cost_net: Number(row.cost_net || row.costo_neto) || 0,
            tax_percent: Number(row.tax_percent || row.iva) || 19,
            price_sell_box: Number(row.price_sell_box || row.precio_venta_caja) || Number(row.price || row.precio) || 0,
            price_sell_unit: Number(row.price_sell_unit || row.precio_venta_unitario) || 0,

            // Legacy Mapped
            price: Number(row.price || row.precio) || 0,
            cost_price: Number(row.cost_price) || 0,

            // Logistics
            stock_actual: Number(row.stock_total || row.stock_actual || row.stock) || 0,
            stock_min: Number(row.stock_min || row.stock_min) || 5,
            stock_max: Number(row.stock_max) || 100,
            expiry_date: row.vencimiento ? new Date(row.vencimiento).getTime() : Date.now() + 31536000000,
            location_id: row.location_id || 'BODEGA_CENTRAL',

            category: (row.category || row.categoria) as any,
            condition: (row.sale_condition || row.condicion_venta) as any,
            allows_commission: row.allows_commission || row.permite_comision || false,
            active_ingredients: row.active_ingredients || row.principios_activos ? (Array.isArray(row.principios_activos) ? row.principios_activos : [row.principios_activos]) : [],
            supplier_id: row.supplier_id || row.proveedor_id || 'SUP-001'
        }));
    } catch (error) {
        console.error('❌ Error fetching inventory:', error);
        return [];
    }
}

export async function fetchEmployees(): Promise<EmployeeProfile[]> {
    try {
        const res = await query('SELECT * FROM users');

        return res.rows.map((row: any) => ({
            id: row.id.toString(),
            rut: row.rut,
            name: row.name,
            role: row.role,
            access_pin: row.access_pin || row.pin, // Match DB column (access_pin)
            status: row.status,
            current_status: 'OUT',
            job_title: row.job_title || 'EMPLEADO',
            labor_data: {
                base_salary: Number(row.base_salary) || 0,
                afp: row.afp || 'MODELO',
                isapre: row.isapre || 'FONASA',
                contract_hours: Number(row.weekly_hours) || 45
            }
        }));
    } catch (error) {
        console.error('Error fetching employees:', error);
        return [];
    }
}
