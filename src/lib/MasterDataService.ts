
import path from 'path';
import fs from 'fs';
import { SmartImporter } from './importer/SmartImporter';
import { UnifiedProduct } from './importer/types';
import { Pool } from 'pg'; // Type only usually, but need it for DI
import { randomUUID, createHash } from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'data_imports');
const DATA_DIR_LEGACY = path.join(process.cwd(), 'data'); // User mentioned data folder too

export class MasterDataService {
    private importer: SmartImporter;
    private pool: Pool;

    constructor(pool: Pool) {
        this.importer = new SmartImporter();
        this.pool = pool;
    }

    async runFullImport() {
        console.log('🚀 Starting Master Data Fusion...');

        // 1. Collect all files
        const files = [
            ...this.getFiles(DATA_DIR),
            ...this.getFiles(DATA_DIR_LEGACY).filter(f => f.endsWith('.csv')) // Only take CSVs from legacy data to avoid dupes? Or simple duplicates check?
            // User said: "enrich with info from tables of ALL files in @data_imports and @data"
            // Let's be aggressive and load them all, handling duplicates by filename or content hash?
            // Filename check:
        ];

        const uniqueFiles = new Set<string>();
        const filePaths: string[] = [];

        files.forEach(f => {
            const name = path.basename(f);
            if (!uniqueFiles.has(name) && !name.startsWith('~$')) { // Ignore excel locks
                uniqueFiles.add(name);
                filePaths.push(f);
            }
        });

        console.log(`📂 Found ${filePaths.length} unique files to process.`);

        // 2. Load & Parse All
        const allProducts: UnifiedProduct[] = [];

        for (const filePath of filePaths) {
            try {
                const result = await this.importer.importFile(filePath);
                if (result.products.length > 0) {
                    allProducts.push(...result.products);
                    console.log(`   ✅ Loaded ${result.products.length} from ${path.basename(filePath)} (${result.metadata.sourceType})`);
                }
            } catch (err: any) {
                console.warn(`   ⚠️ Error loading ${path.basename(filePath)}: ${err.message}`);
            }
        }

        // 3. Fusion Strategy: "Barcode First"
        const masterMap = new Map<string, UnifiedProduct>();
        const barcodeMap = new Map<string, string>(); // Barcode -> Primary Barcode (Master Key)

        // A. Pass 1: Indexes (Golan Priority)
        // We prioritize Golan products because they have the "Barcode" structure requested
        const golanProducts = allProducts.filter(p => p.origen.includes('Golan'));
        const otherProducts = allProducts.filter(p => !p.origen.includes('Golan'));

        // Load Golan first
        this.mergeProducts(masterMap, barcodeMap, golanProducts);
        // Load others
        this.mergeProducts(masterMap, barcodeMap, otherProducts);

        console.log(`🧬 Fused into ${masterMap.size} unique Golden Records.`);

        // 4. Persistence
        await this.persistToDatabase(Array.from(masterMap.values()));

        return { success: true, count: masterMap.size };
    }

    private mergeProducts(
        masterMap: Map<string, UnifiedProduct>,
        barcodeMap: Map<string, string>,
        products: UnifiedProduct[]
    ) {
        for (const p of products) {
            // Find Match
            let matchKey: string | undefined;

            // Try Barcode Match
            if (p.primaryParams.barcode && !p.primaryParams.barcode.startsWith('GOL-GEN') && !p.primaryParams.barcode.startsWith('GEN-') && !p.primaryParams.barcode.startsWith('SKU-')) {
                if (barcodeMap.has(p.primaryParams.barcode)) {
                    matchKey = barcodeMap.get(p.primaryParams.barcode);
                }
            }

            // Try Fuzzy Name Match? 
            // User requested "Barcode First". "Si no lo tiene, creamos producto nuevo".
            // But we should try to match POS items (which have barcodes) to Golan items (which determine the master).

            if (!matchKey && p.primaryParams.barcode && masterMap.has(p.primaryParams.barcode)) {
                matchKey = p.primaryParams.barcode;
            }

            if (matchKey) {
                // Enrich existing
                const master = masterMap.get(matchKey)!;
                this.enrichProduct(master, p);
            } else {
                // New Root
                // If it's a "weak" product (Generic/ISP/NoCode) check name match?
                // For now, simple insert
                const key = p.primaryParams.barcode || `AUTO-${randomUUID()}`;
                masterMap.set(key, p);
                if (p.primaryParams.barcode) barcodeMap.set(p.primaryParams.barcode, key);
            }
        }
    }

    private enrichProduct(target: UnifiedProduct, source: UnifiedProduct) {
        // Enriches target with data from source if missing

        // Metadata
        if (!target.marca && source.marca) target.marca = source.marca;
        if (!target.laboratorio && source.laboratorio) target.laboratorio = source.laboratorio;

        // Clinical (Priority to Sucursal/ISP)
        if (!target.principioActivo && source.principioActivo) target.principioActivo = source.principioActivo;
        if (!target.accionTerapeutica && source.accionTerapeutica) target.accionTerapeutica = source.accionTerapeutica;
        if (!target.registroIsp && source.registroIsp) target.registroIsp = source.registroIsp;
        if (source.esBioequivalente) target.esBioequivalente = true;
        if (source.recetaMedica) target.recetaMedica = true;

        // Inventory
        target.inventario.push(...source.inventario);

        // Tracking
        target.origen.push(...source.origen);
        target.tags.push(...source.tags);
    }

    private getFiles(dir: string): string[] {
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir).map(f => path.join(dir, f));
    }

    /**
     * Persist unified data to PostgreSQL
     */
    async persistToDatabase(products: UnifiedProduct[]) {
        console.log(`💾 Persisting ${products.length} records to Database...`);

        try {
            // 1. Fetch existing SKUs to diff (optional logic for logs, skipped for speed/simplicity in stateless mode)
            // But let's check count for reporting.
            const existingRes = await this.pool.query('SELECT count(*) FROM products');
            const startCount = parseInt(existingRes.rows[0].count);
            console.log(`   Start DB Count: ${startCount}`);

            const toInsert: UnifiedProduct[] = products;
            console.log(`   Processing ${toInsert.length} records via Batch Upsert...`);

            // Batch Processing Size
            const BATCH_SIZE = 200; // Safe size for Postgres parameters

            let insertedCount = 0;

            for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
                const chunk = toInsert.slice(i, i + BATCH_SIZE);

                const values: any[] = [];
                const placeholders: string[] = [];

                chunk.forEach((p, idx) => {
                    const paramsOffset = idx * 13; // 13 columns below

                    const mainBarcode = p.primaryParams.barcode;
                    const cleanName = p.nombreComercial.substring(0, 255);
                    const sku = p.primaryParams.sku || mainBarcode;

                    // Sanity check numeric fields
                    const safeInt = (val: number | undefined) => {
                        if (!val) return 0;
                        if (val > 1000000) return 999999;
                        return Math.round(val);
                    };
                    // Ensure SKU is unique and not empty. fallback to 'AUTO-{idx}' if needed to avoid '' collisions in unique index
                    const rawSku = p.primaryParams.sku || mainBarcode || `AUTO-${idx}-${Date.now()}`;
                    const skuTrunc = rawSku.substring(0, 50);
                    const lab = (p.laboratorio || 'GENERICO').substring(0, 100);
                    const isp = (p.registroIsp || '').substring(0, 50);

                    // Deterministic ID generation logic
                    const id = this.generateId(rawSku);

                    // Helper to join tags/origins into source_system string
                    const sourceSystem = p.origen.join(', ').substring(0, 50); // Truncate to 50

                    values.push(
                        id, // 1
                        skuTrunc, // 2
                        cleanName, // 3
                        lab, // 4
                        isp || null, // 5
                        safeInt(p.inventario.find(i => i.precioVenta > 0)?.precioVenta || 0), // 6
                        safeInt(p.inventario.find(i => i.costoNeto > 0)?.costoNeto || 0), // 7
                        p.inventario.reduce((acc, inv) => acc + safeInt(inv.stock), 0), // 8
                        p.esBioequivalente || false, // 9
                        new Date(), // 10
                        new Date(), // 11
                        sourceSystem, // 12 (mapped to source_system)
                        (mainBarcode || '').substring(0, 50) // 13 (mapped to barcode column)
                    );

                    placeholders.push(`($${paramsOffset + 1}, $${paramsOffset + 2}, $${paramsOffset + 3}, $${paramsOffset + 4}, $${paramsOffset + 5}, $${paramsOffset + 6}, $${paramsOffset + 7}, $${paramsOffset + 8}, $${paramsOffset + 9}, $${paramsOffset + 10}, $${paramsOffset + 11}, $${paramsOffset + 12}, $${paramsOffset + 13})`);
                });

                const query = `
                    INSERT INTO products (
                        id, sku, name, laboratory, isp_register, 
                        price, cost_price, stock_total, 
                        is_bioequivalent, created_at, updated_at,
                        source_system, barcode
                    ) VALUES ${placeholders.join(', ')}
                    ON CONFLICT (sku) DO UPDATE SET
                        name = EXCLUDED.name,
                        price = EXCLUDED.price,
                        stock_total = EXCLUDED.stock_total,
                        updated_at = EXCLUDED.updated_at,
                        source_system = EXCLUDED.source_system,
                        barcode = EXCLUDED.barcode
                    RETURNING id;
                `;

                try {
                    const res = await this.pool.query(query, values);
                    insertedCount += res.rowCount || 0;
                    process.stdout.write('+');
                } catch (e: any) {
                    console.error(`\n❌ Batch Error (skipping ${chunk.length}):`, e.message);
                }
            }

            console.log(`\n✅ Persistence Complete. Processed: ${toInsert.length}, Rows Touched: ${insertedCount}`);

            const finalCountRes = await this.pool.query('SELECT count(*) FROM products');
            console.log(`📊 Final DB Count: ${finalCountRes.rows[0].count}`);

        } catch (err) {
            console.error("Critical Error during persistence:", err);
            throw err;
        }
    }

    private generateId(input: string): string {
        const hash = createHash('md5').update(input || 'null').digest('hex');
        // Format as UUID: 8-4-4-4-12
        return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;
    }
}
