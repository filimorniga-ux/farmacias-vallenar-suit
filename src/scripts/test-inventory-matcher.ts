
import { processImportBatch } from '../services/inventory-matcher.ts';

const main = async () => {
    console.log("🧪 Testing AI Matcher...");
    try {
        const result = await processImportBatch(5); // Test small batch
        console.log("✅ Result:", result);
    } catch (e) {
        console.error("❌ Error:", e);
    }
};

main();
