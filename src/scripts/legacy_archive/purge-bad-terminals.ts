import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function query(text: string, params?: any[]) {
    return pool.query(text, params);
}

async function purgeTerminals() {
    console.log('🧹 Starting Terminal Purge...');

    try {
        // 1. Fetch all terminals grouped by location
        // We want to identify duplicates (same name in same location)
        // and bad names (case insensitive checks)
        const res = await query(`
            SELECT id, location_id, name, status, created_at 
            FROM terminals 
            ORDER BY location_id, created_at ASC
        `);

        const terminals = res.rows;
        const keepIds = new Set<string>();
        const deleteIds: string[] = [];
        const seen = new Map<string, string>(); // Key: "locationId:normalizedName" -> terminalId

        console.log(`🔍 Found ${terminals.length} total terminals. Analyzing...`);

        for (const t of terminals) {
            const name = t.name.trim();
            const locationId = t.location_id;

            // Normalize: "Caja 1 Stgo" -> "caja 1 stgo" -> match pattern "caja X"
            // If name is just "caja" or "terminal", it's vague.

            // Key for uniqueness: Location + Normalized Name
            // We strip accents and lowercase key
            const normalizedName = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const key = `${locationId}:${normalizedName}`;

            if (seen.has(key)) {
                // Duplicate found! We keep the first one (since we ordered by created_at ASC)
                // Actually, maybe we should keep the one that is OPEN? 
                // For safety, let's assume the first one created is the 'canonical' one, 
                // UNLESS the current one is 'OPEN' and the previous was 'CLOSED'.
                // But simplified: First one wins.
                console.log(`🗑️  Duplicate found: "${name}" (${t.id}) in loc ${locationId}. Marking for deletion.`);
                deleteIds.push(t.id);
            } else {
                seen.set(key, t.id);
                keepIds.add(t.id);
            }
        }

        console.log(`✨ Analysis Complete. Keeping ${keepIds.size}. Deleting ${deleteIds.length}.`);

        if (deleteIds.length > 0) {
            // Delete duplicates
            // Check constraints? sessions might reference them.
            // If sessions reference them, we might need to migrate sessions to the kept ID...
            // Or soft delete.
            // Requirement says "Delete physically".
            // Let's try soft delete first to be safe, then hard if user insists.
            // User prompt says: "Eliminar físicamente (DELETEs)..."
            // OK, but we must protect integrity.

            for (const id of deleteIds) {
                try {
                    // Try hard delete
                    await query('DELETE FROM terminals WHERE id = $1', [id]);
                    console.log(`✅ Deleted ${id}`);
                } catch (e: any) {
                    if (e.code === '23503') { // Foreign key violation
                        console.warn(`⚠️  Cannot delete ${id} (has sessions). Soft deleting instead.`);
                        await query("UPDATE terminals SET status = 'DELETED', is_active = false, deleted_at = NOW() WHERE id = $1", [id]);
                    } else {
                        console.error(`❌ Error deleting ${id}:`, e.message);
                    }
                }
            }
        }

        // 2. Reset kept terminals to a clean state if they have weird names?
        // User said: "Resetear el estado de las cajas sobrevivientes a CLOSED"
        if (keepIds.size > 0) {
            const ids = Array.from(keepIds);
            // Only reset if not open with active session? 
            // Better safe: Reset all to CLOSED to fix "stuck" states related to the bugs.
            // CAREFUL: If a real store is live right now, this kills their session.
            // Given "bad creation" context, it's likely a setup phase or mess.
            // Let's reset only if NOT linked to a truly active session that updated recently?
            // User instruction: "Resetear el estado... a CLOSED".
            await query(`UPDATE terminals SET status = 'CLOSED', current_cashier_id = NULL WHERE id = ANY($1)`, [ids]);
            console.log(`🔄 Reset ${ids.length} terminals to CLOSED.`);
        }

        console.log('✅ Purge Complete.');

    } catch (error) {
        console.error('❌ Purge Failed:', error);
    } finally {
        pool.end();
    }
}

purgeTerminals();
