
import dotenv from 'dotenv';
import path from 'path';

// Fix: Load .env explicitly
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function verify() {
    console.log('🔍 Verifying WMS & Logistics Integration...');

    // 1. Verify WMS Movements
    try {
        const { getRecentMovements } = await import('../actions/inventory');
        const movements = await getRecentMovements();
        console.log(`📦 WMS Movements Found: ${movements.length}`);
        if (movements.length > 0) {
            console.log('   Example:', movements[0]);
        } else {
            console.warn('   ⚠️ No movements found. Check db seeds.');
        }
    } catch (e) {
        console.error('   ❌ WMS Action Failed:', e);
    }

    // 2. Verify Logistics KPIs
    try {
        const { getLogisticsKPIs } = await import('../actions/reports-detail');
        // Usar fechas amplias
        const now = new Date();
        const lastMonth = new Date();
        lastMonth.setMonth(now.getMonth() - 2);

        const kpis = await getLogisticsKPIs(lastMonth.toISOString(), now.toISOString());
        console.log(`📊 Logistics KPIs:`, kpis);
        if (kpis.total_in === 0 && kpis.total_out === 0) {
            console.warn('   ⚠️ KPIs are zero. Check date ranges or movement types.');
        }
    } catch (e) {
        console.error('   ❌ Logistics Action Failed:', e);
    }

    process.exit(0);
}

verify();
