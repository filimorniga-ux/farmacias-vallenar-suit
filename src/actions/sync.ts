'use server';

import { query } from '../lib/db';
import { InventoryBatch, EmployeeProfile } from '../domain/types';

export async function fetchInventory(): Promise<InventoryBatch[]> {
    try {
        const res = await query('SELECT * FROM productos');

        // Map DB columns to Domain Type
        // Assuming DB columns might be snake_case or slightly different. 
        // We map what we can and default the rest for safety.
        return res.rows.map((row: any) => ({
            id: row.id?.toString() || `PROD-${Math.random()}`,
            sku: row.sku || row.codigo || 'UNKNOWN',
            name: row.nombre || row.name || 'Sin Nombre',
            dci: row.dci || row.principio_activo || '',
            // lot_number is removed as per new mapping, if needed, add back with a default
            expiry_date: row.vencimiento ? new Date(row.vencimiento).getTime() : Date.now() + 31536000000,
            category: (row.category || row.categoria) as any, // Use row.category if available, fallback to row.categoria
            condition: (row.sale_condition || row.condicion_venta) as any, // Map DB column to new field name, fallback to old DB field
            // storage_condition is removed as per new mapping, if needed, add back with a default
            allows_commission: row.allows_commission || row.permite_comision || false,
            active_ingredients: row.active_ingredients || row.principios_activos ? (Array.isArray(row.principios_activos) ? row.principios_activos : [row.principios_activos]) : [],
            is_bioequivalent: row.is_bioequivalent || row.es_bioequivalente || false,
            stock_actual: Number(row.stock_actual || row.stock) || 0,
            stock_min: Number(row.stock_min || row.stock_min) || 5,
            stock_max: Number(row.stock_max) || 100, // New field
            price: Number(row.price || row.precio) || 0,
            cost_price: Number(row.cost_price) || 0, // New field
            supplier_id: row.supplier_id || row.proveedor_id || 'SUP-001',
            location_id: row.location_id || 'BODEGA_CENTRAL' // New field with default
        }));
    } catch (error) {
        console.error('Error fetching inventory:', error);
        return [];
    }
}

export async function fetchEmployees(): Promise<EmployeeProfile[]> {
    try {
        const res = await query('SELECT * FROM users');

        return res.rows.map((row: any) => ({
            id: row.id?.toString() || `EMP-${Math.random()}`,
            rut: row.rut || 'UNKNOWN',
            name: row.nombre || row.name || 'Sin Nombre',
            role: row.rol || 'CASHIER', // Default to safest role
            access_pin: row.pin || '0000',
            labor_data: {
                base_salary: parseFloat(row.base_salary),
                afp: row.afp,
                isapre: row.isapre,
                contract_hours: 45 // Default to 45 hours
            },
            status: row.status,
            current_status: 'OUT' // Default status
        }));
    } catch (error) {
        console.error('Error fetching employees:', error);
        return [];
    }
}
