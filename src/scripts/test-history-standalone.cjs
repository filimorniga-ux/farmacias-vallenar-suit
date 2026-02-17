
const { Pool } = require('pg');

// Mock params
const DATABASE_URL = 'postgres://tsdbadmin:nxdbe4pq4cpwhq4j@q64exeso6s.m1xugm0lj9.tsdb.cloud.timescale.com:35210/tsdb?sslmode=require';

const pool = new Pool({
    connectionString: DATABASE_URL,
});

async function query(text, params) {
    return pool.query(text, params);
}

async function getSupplyChainHistorySecure(filters) {
    console.log('--- Simulating getSupplyChainHistorySecure ---');
    try {
        const page = filters?.page || 1;
        const pageSize = filters?.pageSize || 20;
        const offset = (page - 1) * pageSize;

        const conditions = [];
        const params = [];
        let pIdx = 1;

        let poQuery = `
            SELECT 
                'PO' as main_type,
                po.id,
                po.status,
                NULL as shipment_type,
                po.supplier_id,
                s.business_name as supplier_name,
                po.target_warehouse_id as warehouse_id,
                w.location_id,
                l.name as location_name,
                po.created_at,
                NULL as updated_at,
                po.notes,
                (SELECT COUNT(*) FROM purchase_order_items WHERE purchase_order_id = po.id) as items_count,
                NULL as origin_location_id,
                NULL as origin_location_name
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            LEFT JOIN warehouses w ON po.target_warehouse_id = w.id
            LEFT JOIN locations l ON w.location_id = l.id
        `;

        let shipQuery = `
            SELECT 
                'SHIPMENT' as main_type,
                s.id,
                s.status,
                s.type as shipment_type,
                NULL as supplier_id,
                NULL as supplier_name,
                NULL as warehouse_id,
                s.destination_location_id as location_id,
                dl.name as location_name,
                s.created_at,
                s.updated_at,
                s.notes,
                (SELECT COUNT(*) FROM shipment_items WHERE shipment_id = s.id) as items_count,
                s.origin_location_id,
                ol.name as origin_location_name
            FROM shipments s
            LEFT JOIN locations dl ON s.destination_location_id = dl.id
            LEFT JOIN locations ol ON s.origin_location_id = ol.id
        `;

        const poWhere = [];
        const shipWhere = [];

        if (filters?.locationId) {
            poWhere.push(`w.location_id = $${pIdx}`);
            shipWhere.push(`(s.destination_location_id = $${pIdx} OR s.origin_location_id = $${pIdx})`);
            params.push(filters.locationId);
            pIdx++;
        }

        if (filters?.supplierId) {
            poWhere.push(`po.supplier_id = $${pIdx}`);
            shipWhere.push(`FALSE`);
            params.push(filters.supplierId);
            pIdx++;
        }

        if (filters?.status) {
            poWhere.push(`po.status = $${pIdx}`);
            shipWhere.push(`s.status = $${pIdx}`);
            params.push(filters.status);
            pIdx++;
        }

        const finalPoQuery = poWhere.length > 0 ? `${poQuery} WHERE ${poWhere.join(' AND ')}` : poQuery;
        const finalShipQuery = shipWhere.length > 0 ? `${shipQuery} WHERE ${shipWhere.join(' AND ')}` : shipQuery;

        let combinedQuery = "";
        if (filters?.type === 'PO') {
            combinedQuery = finalPoQuery;
        } else if (filters?.type === 'SHIPMENT') {
            combinedQuery = finalShipQuery;
        } else {
            combinedQuery = `(${finalPoQuery}) UNION ALL (${finalShipQuery})`;
        }

        const countRes = await query(`SELECT COUNT(*) as total FROM (${combinedQuery}) as results`, params);
        const total = parseInt(countRes.rows[0].total);
        console.log('Total count:', total);

        const dataRes = await query(`
            SELECT * FROM (${combinedQuery}) as results
            ORDER BY created_at DESC
            LIMIT $${pIdx++} OFFSET $${pIdx++}
        `, [...params, pageSize, offset]);

        return { success: true, data: dataRes.rows, total };
    } catch (error) {
        console.error('Error in getSupplyChainHistorySecure:', error);
        return { success: false, error: error.message };
    }
}

async function getHistoryItemDetailsSecure(id, type) {
    console.log(`--- Simulating getHistoryItemDetailsSecure ID: ${id} Type: ${type} ---`);
    try {
        let res;
        if (type === 'PO') {
            res = await query(`
                SELECT 
                    id, 
                    sku, 
                    name, 
                    quantity_ordered as quantity, 
                    quantity_received,
                    cost_price as cost
                FROM purchase_order_items 
                WHERE purchase_order_id = $1
            `, [id]);
        } else {
            res = await query(`
                SELECT 
                    si.id, 
                    si.sku, 
                    si.name, 
                    si.quantity, 
                    si.condition,
                    ib.expiry_date,
                    ib.lot_number
                FROM shipment_items si
                LEFT JOIN inventory_batches ib ON si.batch_id = ib.id
                WHERE si.shipment_id = $1
            `, [id]);
        }

        return { success: true, data: res.rows };
    } catch (error) {
        console.error('Error in getHistoryItemDetailsSecure:', error);
        return { success: false, error: error.message };
    }
}


async function testHistory() {
    try {
        const historyRes = await getSupplyChainHistorySecure({ page: 1, pageSize: 5 });

        if (historyRes.success) {
            console.log(`Success! Retrieved ${historyRes.data.length} items from total ${historyRes.total}.`);

            if (historyRes.data.length > 0) {
                const firstItem = historyRes.data[0];
                console.log('First Item Sample:', JSON.stringify(firstItem, null, 2));

                const detailsRes = await getHistoryItemDetailsSecure(firstItem.id, firstItem.main_type);

                if (detailsRes.success) {
                    console.log(`Details found: ${detailsRes.data.length} items.`);
                    if (detailsRes.data.length > 0) {
                        console.log('First Detail Item:', JSON.stringify(detailsRes.data[0], null, 2));
                    }
                } else {
                    console.error('Failed to get details:', detailsRes.error);
                }
            } else {
                console.log('No history items found.');
            }
        } else {
            console.error('Failed to get history:', historyRes.error);
        }

    } catch (error) {
        console.error('Test failed with error:', error);
    } finally {
        await pool.end();
    }
}

testHistory();
