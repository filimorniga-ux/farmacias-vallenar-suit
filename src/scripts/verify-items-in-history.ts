
import { getPurchaseOrderHistory } from '../actions/procurement-v2';

async function verify() {
    console.log('🧪 Verifying PO History with Items...');

    // We expect the direct call to return orders WITH items now
    const result = await getPurchaseOrderHistory();

    if (result.success && result.data) {
        console.log(`Found ${result.data.orders.length} orders.`);
        result.data.orders.slice(0, 3).forEach(po => {
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
