
import { getInventorySecure } from '../src/actions/inventory-v2';
import { getLocationsSecure } from '../src/actions/locations-v2';

async function run() {
    try {
        console.log('🔎 Buscando locations...');
        const locResult = await getLocationsSecure();
        if (!locResult.success || !locResult.data || locResult.data.length === 0) {
            console.error('❌ No se encontraron locations.');
            return;
        }

        const locationId = locResult.data[0].id; // Usar la primera location
        console.log(`📍 Usando Location ID: ${locationId} (${locResult.data[0].name})`);

        // Test 1: Category = 'ALL'
        console.log('\n🧪 TEST 1: Category = "ALL"');
        const resultAll = await getInventorySecure(locationId, {
            category: 'ALL',
            limit: 10,
            page: 1,
            pagination: true
        });

        if (resultAll.success) {
            console.log(`✅ Success. Data Length: ${resultAll.data.length}`);
            console.log(`📊 Meta Total: ${resultAll.meta?.total}`);
            if (resultAll.data.length === 0) {
                console.error('🚨 ERROR: "ALL" devolvió 0 resultados, pero debería tener datos.');
            }
        } else {
            console.error('❌ Error en getInventorySecure:', resultAll.error);
        }

        // Test 2: Category = 'MEDS'
        console.log('\n🧪 TEST 2: Category = "MEDS"');
        const resultMeds = await getInventorySecure(locationId, {
            category: 'MEDS',
            limit: 10,
            page: 1,
            pagination: true
        });

        if (resultMeds.success) {
            console.log(`✅ Success. Data Length: ${resultMeds.data.length}`);
            console.log(`📊 Meta Total: ${resultMeds.meta?.total}`);
        } else {
            console.error('❌ Error en getInventorySecure:', resultMeds.error);
        }

    } catch (error) {
        console.error('💥 Excepción no manejada:', error);
    }
}

run();
