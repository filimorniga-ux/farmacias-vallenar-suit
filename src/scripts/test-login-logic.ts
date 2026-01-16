
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

const GLOBAL_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'DRIVER', 'QF'];

async function testLoginLogic() {
    try {
        await client.connect();

        // 1. Get Location ID
        const locRes = await client.query("SELECT id, name FROM locations WHERE name ILIKE '%santiago%'");
        if (locRes.rows.length === 0) {
            console.error("Location 'santiago' not found");
            return;
        }
        const targetLocation = locRes.rows[0];
        console.log(`Target Location: ${targetLocation.name} (${targetLocation.id})`);

        // 2. Get User
        const userRes = await client.query("SELECT * FROM users WHERE name ILIKE '%Gerente General 1%'");
        if (userRes.rows.length === 0) {
            console.error("User not found");
            return;
        }
        const user = userRes.rows[0];
        console.log(`User: ${user.name} (${user.id})`);
        console.log(`User Role: ${user.role}`);
        console.log(`User Assigned Location: ${user.assigned_location_id}`);

        // 3. Logic Check
        const role = (user.role || '').toUpperCase();
        const isGlobalRole = GLOBAL_ROLES.includes(role);
        console.log(`Is Global Role? ${isGlobalRole}`);

        if (isGlobalRole) {
            console.log("✅ ACCESS GRANTED (Global Role)");
        } else {
            if (user.assigned_location_id === targetLocation.id) {
                console.log("✅ ACCESS GRANTED (Location Match)");
            } else {
                console.log("❌ ACCESS DENIED (Location Mismatch)");
                console.log(`Expected: ${user.assigned_location_id}`);
                console.log(`Got: ${targetLocation.id}`);
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
testLoginLogic();
