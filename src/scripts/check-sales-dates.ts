
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Fallback logic
if (!process.env.DATABASE_URL) {
    console.log('⚠️ DATABASE_URL not found, checking alternates...');
    if (process.env.POSTGRES_URL) {
        process.env.DATABASE_URL = process.env.POSTGRES_URL;
        console.log('✅ Used POSTGRES_URL');
    } else if (process.env.POSTGRES_URL_NON_POOLING) {
        process.env.DATABASE_URL = process.env.POSTGRES_URL_NON_POOLING;
        console.log('✅ Used POSTGRES_URL_NON_POOLING');
    } else {
        console.error('❌ No database URL found in env');
        console.log('Available keys:', Object.keys(process.env).filter(k => k.includes('DB') || k.includes('POSTGRES') || k.includes('URL')));
    }
}

import { query } from '../lib/db';

async function checkSales() {
    try {
        console.log('--- Checking Sales Data ---');

        // 1. Count Total Sales
        const countRes = await query('SELECT COUNT(*) FROM sales');
        console.log(`Total Sales: ${countRes.rows[0].count}`);

        // 2. data range
        const rangeRes = await query('SELECT MIN(timestamp) as min_date, MAX(timestamp) as max_date FROM sales');
        console.log('Date Range:', rangeRes.rows[0]);

        // 3. Sample timestamps (raw) to check format
        const sampleRes = await query('SELECT id, timestamp FROM sales LIMIT 5');
        console.log('Sample Raw Timestamps:', sampleRes.rows);

        // 4. Check Sales for Dec 2025 specifically (Simulation Date)
        // The user metadata says current date is 2025-12-09.
        const decRes = await query(`
        SELECT COUNT(*) 
        FROM sales 
        WHERE timestamp >= '2025-12-01 00:00:00' 
        AND timestamp <= '2025-12-31 23:59:59'
    `);
        console.log(`Sales in Dec 2025: ${decRes.rows[0].count}`);

        // 5. Check Sales for TODAY (2025-12-09)
        const todayRes = await query(`
        SELECT COUNT(*) 
        FROM sales 
        WHERE timestamp >= '2025-12-09 00:00:00' 
        AND timestamp <= '2025-12-09 23:59:59'
    `);
        console.log(`Sales for Today (2025-12-09): ${todayRes.rows[0].count}`);

    } catch (error) {
        console.error('Error checking sales:', error);
    }
}

checkSales();
