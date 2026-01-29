
import { pool } from '../lib/db-cli';

async function seedTemplates() {
    console.log('🌱 Seeding Shift Templates...');

    const templates = [
        { name: 'Turno Mañana (Apertura)', start: '08:00', end: '16:00', color: '#10b981' }, // Emerald
        { name: 'Turno Tarde', start: '12:00', end: '20:00', color: '#f59e0b' }, // Amber
        { name: 'Turno Cierre', start: '14:00', end: '22:00', color: '#ef4444' }, // Red
        { name: 'Turno Noche (Guardia)', start: '22:00', end: '06:00', color: '#6366f1' }, // Indigo (Night shift test)
        { name: 'Turno Intermedio', start: '10:00', end: '18:00', color: '#ec4899' } // Pink
    ];

    try {
        for (const t of templates) {
            await pool.query(`
                INSERT INTO shift_templates (name, start_time, end_time, color, is_active)
                VALUES ($1, $2, $3, $4, true)
            `, [t.name, t.start, t.end, t.color]);
        }
        console.log('✅ Templates inserted successfully.');
    } catch (err) {
        console.error('❌ Error seeding templates:', err);
    } finally {
        await pool.end();
    }
}

seedTemplates();
