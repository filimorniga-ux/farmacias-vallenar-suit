
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkProductAndBatches() {
    try {
        const searchTerm = '3A ofteno';

        // Find products matching the name
        const products = await prisma.product.findMany({
            where: {
                name: {
                    contains: searchTerm,
                    mode: 'insensitive'
                }
            },
            include: {
                inventory: true // Include batches/inventory relation if it exists directly or via another name
            }
        });

        console.log(`Found ${products.length} products matching '${searchTerm}'`);

        for (const p of products) {
            console.log(`\nProduct: ${p.name} (ID: ${p.id}, SKU: ${p.sku})`);
            // Check batches for this product
            const batches = await prisma.inventoryBatch.findMany({
                where: { productId: p.id }
            });
            console.log(`- Batches found: ${batches.length}`);
            batches.forEach(b => {
                console.log(`  - Batch ID: ${b.id}, Lot: ${b.lotNumber}, Qty: ${b.quantityReal}, Loc: ${b.locationId}, Warehouse: ${b.warehouseId}, Created: ${b.createdAt}`);
            });
        }

    } catch (error) {
        console.error('Error checking data:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkProductAndBatches();
