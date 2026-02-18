
import { getPurchaseOrderHistory } from '../actions/procurement-v2';

interface POItem {
    name: string;
    quantity_ordered: number;
}

interface POWithItems {
    id: string;
    status: string;
    items?: POItem[];
}

async function verify() {
    console.log('🧪 Verifying PO History with Items...');

    // We expect the direct call to return orders WITH items now
    const result = await getPurchaseOrderHistory();

    if (result.success && result.data) {
        const orders = result.data.orders as unknown as POWithItems[];
        console.log(`Found ${orders.length} orders.`);
        orders.slice(0, 3).forEach(po => {
            console.log(`\nPO ID: ${po.id} | Status: ${po.status}`);
            console.log(`Items found in object: ${po.items ? po.items.length : 'MISSING'}`);
            if (po.items && po.items.length > 0) {
                console.log(`Sample item: ${po.items[0].name} (Qty: ${po.items[0].quantity_ordered})`);
            }
        });
    } else {
        console.error('❌ Failed to fetch history:', result.error);
    }
}

verify().catch(console.error);
