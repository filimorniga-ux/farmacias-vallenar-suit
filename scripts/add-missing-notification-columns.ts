
import 'dotenv/config';
import { Client } from 'pg';

async function migrate() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Adding missing columns to notifications table...');

        // Add location_id
        await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='location_id') THEN
          ALTER TABLE notifications ADD COLUMN location_id UUID;
        END IF;
      END $$;
    `);
        console.log('Added location_id');

        // Add metadata
        await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='metadata') THEN
          ALTER TABLE notifications ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
        END IF;
      END $$;
    `);
        console.log('Added metadata');

        // Add severity
        await client.query(`
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='severity') THEN
                ALTER TABLE notifications ADD COLUMN severity VARCHAR(50) DEFAULT 'INFO';
            END IF;
        END $$;
    `);
        console.log('Added severity');

    } catch (error) {
        console.error('Migration error:', error);
    } finally {
        await client.end();
    }
}

migrate();
