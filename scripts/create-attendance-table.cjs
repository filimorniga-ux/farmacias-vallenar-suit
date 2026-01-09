
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('Creating attendance_logs table...');
        await client.query(`
      CREATE TABLE IF NOT EXISTS attendance_logs (
        id UUID PRIMARY KEY,
        user_id UUID REFERENCES users(id),
        type VARCHAR(20) NOT NULL,
        location_id UUID REFERENCES locations(id),
        method VARCHAR(20) DEFAULT 'PIN',
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        observation TEXT,
        evidence_photo_url TEXT,
        overtime_minutes INT DEFAULT 0,
        overtime_approved BOOLEAN DEFAULT FALSE,
        overtime_approved_by UUID REFERENCES users(id),
        overtime_approval_notes TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance_logs(user_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_attendance_location_date ON attendance_logs(location_id, timestamp);
    `);
        console.log('Attendance logs table created successfully.');
    } catch (err) {
        console.error('Error creating table:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
