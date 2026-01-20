
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { MasterDataService } from '../src/lib/MasterDataService';
import { UnifiedProduct } from '../src/lib/importer/types';
import { createHash } from 'crypto';

dotenv.config({ path: '.env.local' });

async function main() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    console.log('🔌 Querying DB to warm up...');
    await pool.query('SELECT 1');
    console.log('✅ Connected.');

    const service = new MasterDataService(pool);

    const testProduct: UnifiedProduct = {
        nombreComercial: "TEST PRODUCT PERSISTENCE",
        primaryParams: { barcode: "TEST-99999", sku: "TEST-99999" },
        inventario: [{ stock: 10, precioVenta: 1000, costoNeto: 500, sucursal: "Test" }],
        origen: ["TestScript"],
        laboratorio: "TEST LAB",
        principioActivo: "TEST DCI",
        registroIsp: "TEST-ISP",
        esBioequivalente: false,
        recetaMedica: false,
        tags: []
    };

    console.log('💾 Attempting to persist 1 record...');
    await service.persistToDatabase([testProduct]);
    console.log('✅ Persistence finished.');

    await pool.end();
}

main().catch(console.error);
