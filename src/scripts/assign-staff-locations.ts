
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function assignStaffLocations() {
    const { query } = await import('../lib/db');
    try {
        console.log('🏗️ Starting Auto-Assignment of Staff Locations...');

        // 1. Fetch Locations
        const locRes = await query("SELECT id, name FROM locations");
        const centerLoc = locRes.rows.find(l => l.name.toUpperCase().includes('CENTRO'));
        const pratLoc = locRes.rows.find(l => l.name.toUpperCase().includes('PRAT'));
        const warehouseLoc = locRes.rows.find(l => l.name.toUpperCase().includes('BODEGA'));

        console.log('📍 Locations Found:', {
            CENTRO: centerLoc?.name,
            PRAT: pratLoc?.name,
            BODEGA: warehouseLoc?.name
        });

        // 2. Fetch Users
        const userRes = await query("SELECT id, name, role FROM users");
        const users = userRes.rows;
        console.log(`👥 Analyze ${users.length} users...`);

        let updatedCount = 0;

        for (const user of users) {
            let targetLocId = null;
            const nameUpper = user.name.toUpperCase();
            const roleUpper = user.role.toUpperCase();

            // HEURISTICS
            if (nameUpper.includes('CENTRO') || roleUpper.includes('CENTRO')) {
                targetLocId = centerLoc?.id;
            } else if (nameUpper.includes('PRAT') || roleUpper.includes('PRAT')) {
                targetLocId = pratLoc?.id;
            } else if (nameUpper.includes('BODEGA') || roleUpper.includes('BODEGA') || nameUpper.includes('WAREHOUSE')) {
                targetLocId = warehouseLoc?.id;
            }
            // Admin fallback: usually Global, but if name has specific hint...

            if (targetLocId) {
                await query("UPDATE users SET assigned_location_id = $1 WHERE id = $2", [targetLocId, user.id]);
                console.log(`✅ Assigned ${user.name} -> ${targetLocId === centerLoc?.id ? 'CENTRO' : targetLocId === pratLoc?.id ? 'PRAT' : 'BODEGA'}`);
                updatedCount++;
            }
        }

        console.log(`🎉 Finished. Updated ${updatedCount} users.`);

    } catch (e) {
        console.error('❌ Error:', e);
    }
    process.exit(0);
}

assignStaffLocations();
