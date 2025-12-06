'use server';

import { query } from '../lib/db';
import { InventoryBatch, EmployeeProfile } from '../domain/types';

export async function fetchInventory(warehouseId?: string): Promise<InventoryBatch[]> {
    console.log(`Fetching inventory from DB (Warehouse: ${warehouseId || 'ALL'})...`);
    try {
        // Query Logic:
        // If warehouseId is provided, we fetch batches for that warehouse joined with product details.
        // If not, we might be fetching GLOBAL catalog (master data) or all batches.
        // For POS, we usually want specific warehouse stock.

        let sql = `
            SELECT 
                p.*, 
                ib.id as batch_id,
                ib.warehouse_id,
                ib.lot_number,
                ib.expiry_date as batch_expiry,
                ib.quantity_real,
                ib.unit_cost,
                ib.sale_price as batch_price
            FROM products p
            LEFT JOIN inventory_batches ib ON p.id = ib.product_id
        `;

        const params: any[] = [];
        if (warehouseId) {
            sql += ` WHERE ib.warehouse_id = $1`;
            params.push(warehouseId);
        }

        // Note: multiple batches per product? 
        // The Domain Type 'InventoryBatch' is actually a flattened Product + Batch info.
        // If a product has multiple batches, this query returns multiple rows (one per batch).
        // If a product has NO batches in this warehouse, it won't show up (LEFT JOIN matches p, but WHERE filters ib... wait).
        // If WHERE ib.warehouse_id = $1 is applied, rows with null ib (products without stock) are excluded unless we use (ib.warehouse_id = $1 OR ib.warehouse_id IS NULL).
        // But usually we want to see available stock.
        // Let's stick to returning batches found.

        const res = await query(sql, params);
        console.log(`✅ Fetched ${res.rows.length} inventory items`);

        return res.rows.map((row: any) => ({
            id: row.batch_id?.toString() || row.id?.toString(), // Use Batch ID if available, else Product ID (Master)
            sku: row.sku || row.codigo || 'UNKNOWN',
            name: row.name || 'Sin Nombre',
            dci: row.dci || '',
            laboratory: row.laboratory || 'GENERICO',
            isp_register: row.isp_register || '',
            format: row.format || 'CAJA',
            units_per_box: Number(row.units_per_box) || 1,
            is_bioequivalent: row.is_bioequivalent || false,

            // Batch Specifics
            stock_actual: Number(row.quantity_real) || 0,
            lot_number: row.lot_number || '',
            expiry_date: row.batch_expiry ? new Date(row.batch_expiry).getTime() : (Date.now() + 31536000000),
            price: Number(row.batch_price) || Number(row.price) || 0,
            cost_price: Number(row.unit_cost) || 0,

            // Location
            location_id: row.warehouse_id?.toString() || 'UNKNOWN',

            // Defaults from Master
            concentration: row.concentration || '',
            unit_count: Number(row.unit_count) || 1,
            is_generic: row.is_generic || false,
            bioequivalent_status: 'NO_BIOEQUIVALENTE' as any,
            cost_net: 0,
            tax_percent: 19,
            price_sell_box: Number(row.batch_price) || 0,
            price_sell_unit: 0,

            stock_min: Number(row.stock_min) || 5,
            stock_max: Number(row.stock_max) || 100,

            category: (row.category || 'MEDICAMENTO') as any,
            condition: (row.control_level === 'NONE' ? 'VD' : 'R') as any, // Simple map
            allows_commission: row.allows_commission || false,
            active_ingredients: [],
            supplier_id: 'SUP-001'
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

export async function fetchSuppliers(): Promise<import('../domain/types').Supplier[]> {
    try {
        const res = await query('SELECT * FROM suppliers ORDER BY business_name ASC');
        return res.rows.map((row: any) => ({
            id: row.id.toString(),
            rut: row.rut,
            business_name: row.business_name,
            fantasy_name: row.fantasy_name || row.business_name,
            contact_email: row.contact_email || '',
            payment_terms: row.payment_terms || 'CONTADO',

            // Map remaining fields with defaults since simple schema might not have them
            address: row.address || '',
            region: row.region || '',
            city: row.city || '',
            commune: row.commune || '',
            phone_1: row.phone || row.phone_1 || '',
            email_orders: row.email_orders || row.contact_email || '',
            email_billing: row.email_billing || row.contact_email || '',
            contacts: [],
            brands: [],
            categories: [],
            rating: 5,
            lead_time_days: 0,
            sector: 'LABORATORIO' // Default
        }));
    } catch (error) {
        console.error('⚠️ Error fetching suppliers (Table might not exist):', error);
        return [];
    }
}
