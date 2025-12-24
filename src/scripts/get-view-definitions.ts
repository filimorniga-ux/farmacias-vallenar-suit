
import { pool } from '../lib/db-cli';

async function getViewDefinitions() {
    const client = await pool.connect();
    try {
        const views = ['v_terminals_status', 'v_zombie_sessions'];
        for (const view of views) {
            const res = await client.query(`SELECT pg_get_viewdef($1, true) as def`, [view]);
            if (res.rows.length > 0) {
                console.log(`\nView: ${view}`);
                console.log('Definition:');
                console.log(res.rows[0].def);
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        await pool.end();
    }
}

getViewDefinitions();
