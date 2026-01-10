
import dotenv from 'dotenv';
dotenv.config();

// Fix for direct run with ts-node
import { searchUnifiedProducts } from '../actions/analytics/price-arbitrage';

const main = async () => {
    console.log("🔍 Testing Unified Price Consultant Logic...");

    // We expect some data for 'Paracetamol' or 'Amox' from previous imports
    const terms = ['paracetamol', 'amox'];

    for (const term of terms) {
        console.log(`\n--- Searching: "${term}" ---`);
        const results = await searchUnifiedProducts(term);
        console.log(`Grouped Products Found: ${results.length}`);

        results.forEach((p, i) => {
            if (i < 3) { // Show top 3 groups
                console.log(`\n📦 Group: ${p.productName}`);
                console.log(`   Best Price: $${p.bestPrice} | Max Sell: $${p.highestPrice} | Margin: $${p.maxMargin}`);
                console.log(`   Sources (${p.offerings.length}):`);
                p.offerings.forEach(o => {
                    console.log(`     - [${o.type}] ${o.source}: $${o.price} (Stock: ${o.stock})`);
                });
                if (p.alerts.length > 0) {
                    console.log("   ⚠️ Alerts:", p.alerts);
                }
            }
        });
    }
};

main();
