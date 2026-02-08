
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSchema() {
    try {
        // Check columns in inventory_batches
        const batchColumns = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'inventory_batches';
    `;
        console.log('--- Inventory Batches Columns ---');
        console.table(batchColumns);

        // Check columns in product_entries (if exists, or similar)
        const entryColumns = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'product_entries';
    `;
        console.log('--- Product Entries Columns ---');
        console.table(entryColumns);

        // Check providers
        const providerColumns = await prisma.$queryRaw`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'providers';
    `;
        console.log('--- Providers Columns ---');
        console.table(providerColumns);

    } catch (error) {
        console.error('Error checking schema:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkSchema();
