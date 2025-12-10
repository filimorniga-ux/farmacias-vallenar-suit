
import dotenv from 'dotenv';
import path from 'path';
import { randomUUID } from 'crypto';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function seedStructure() {
    const { query } = await import('../lib/db');
    try {
        console.log('🌱 Starting Structure Seed...');

        // 1. Fetch Locations
        const locRes = await query("SELECT id, name FROM locations");
        const centro = locRes.rows.find(l => l.name.toUpperCase().includes('CENTRO'));
        const prat = locRes.rows.find(l => l.name.toUpperCase().includes('PRAT'));
        const bodegaGen = locRes.rows.find(l => l.name.toUpperCase().includes('GENERAL') || l.name.toUpperCase().includes('BODEGA') && !l.name.toUpperCase().includes('AUX'));
        const bodegaAux = locRes.rows.find(l => l.name.toUpperCase().includes('AUXILIAR'));

        if (!centro || !prat) {
            console.error('❌ Critical Locations missing (Centro or Prat).');
            process.exit(1);
        }

        console.log('📍 Locations:', {
            CENTRO: centro.id,
            PRAT: prat.id,
            BODEGA_GEN: bodegaGen?.id,
            BODEGA_AUX: bodegaAux?.id
        });

        // 2. Create Terminals (Cajas)
        const terminals = [
            { name: 'Caja 01 - Centro', loc: centro.id },
            { name: 'Caja 02 - Centro', loc: centro.id },
            { name: 'Caja 01 - Prat', loc: prat.id },
            { name: 'Caja 02 - Prat', loc: prat.id },
        ];

        for (const t of terminals) {
            // Check existence by name + loc
            const exist = await query("SELECT id FROM terminals WHERE name = $1 AND location_id = $2", [t.name, t.loc]);
            if (exist.rows.length === 0) {
                await query(
                    "INSERT INTO terminals (id, location_id, name, status, created_at) VALUES ($1, $2, $3, 'CLOSED', NOW())",
                    [randomUUID(), t.loc, t.name]
                );
                console.log(`✅ Created Terminal: ${t.name}`);
            } else {
                console.log(`ℹ️ Terminal exists: ${t.name}`);
            }
        }

        // 3. Create Staff
        const staffList = [
            // CENTRO
            { name: 'Camila Centro', role: 'CASHIER', loc: centro.id, title: 'CAJERO_VENDEDOR', rut: '11111111-1' },
            { name: 'Pedro Centro', role: 'CASHIER', loc: centro.id, title: 'CAJERO_VENDEDOR', rut: '11111111-2' },
            { name: 'Admin Centro', role: 'ADMIN', loc: centro.id, title: 'ADMINISTRATIVO', rut: '88888888-1' },
            // PRAT
            { name: 'Sofía Prat', role: 'CASHIER', loc: prat.id, title: 'CAJERO_VENDEDOR', rut: '22222222-1' },
            { name: 'Lucas Prat', role: 'CASHIER', loc: prat.id, title: 'CAJERO_VENDEDOR', rut: '22222222-2' },
            { name: 'Admin Prat', role: 'ADMIN', loc: prat.id, title: 'ADMINISTRATIVO', rut: '99999999-1' },
        ];

        if (bodegaGen) {
            staffList.push(
                { name: 'Jefe Bodega General', role: 'WAREHOUSE', loc: bodegaGen.id, title: 'BODEGUERO', rut: '33333333-1' },
                { name: 'Auxiliar Bodega General', role: 'WAREHOUSE', loc: bodegaGen.id, title: 'AUXILIAR_FARMACIA', rut: '33333333-2' }
            );
        }
        if (bodegaAux) {
            staffList.push(
                { name: 'Jefe Bodega Auxiliar', role: 'WAREHOUSE', loc: bodegaAux.id, title: 'BODEGUERO', rut: '44444444-1' },
                { name: 'Auxiliar Bodega Auxiliar', role: 'WAREHOUSE', loc: bodegaAux.id, title: 'AUXILIAR_FARMACIA', rut: '44444444-2' }
            );
        }

        for (const s of staffList) {
            // Upsert by RUT to avoid duplicates but update data
            // Or just check existence
            const exist = await query("SELECT id FROM users WHERE rut = $1", [s.rut]);
            if (exist.rows.length === 0) {
                await query(`
                    INSERT INTO users (id, rut, name, role, job_title, status, assigned_location_id, base_salary, weekly_hours, created_at)
                    VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, 500000, 45, NOW())
                `, [randomUUID(), s.rut, s.name, s.role, s.title, s.loc]);
                console.log(`✅ Created User: ${s.name}`);
            } else {
                // Update location if exists
                await query("UPDATE users SET assigned_location_id = $1 WHERE rut = $2", [s.loc, s.rut]);
                console.log(`ℹ️ Updated User Location: ${s.name}`);
            }
        }

        console.log('🎉 Seed Complete.');

    } catch (e) {
        console.error('❌ Error:', e);
    }
    process.exit(0);
}

seedStructure();
