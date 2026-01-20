
import pg from 'pg';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const { Pool } = pg;

// Validar que DATABASE_URL existe
if (!process.env.DATABASE_URL) {
    console.error('❌ CRITICAL: DATABASE_URL environment variable is not set!');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function main() {
    console.log('🔌 Iniciando creación de tabla audit_events (Direct DB Connection)...');

    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS audit_events (
                id SERIAL PRIMARY KEY,
                event_id UUID DEFAULT gen_random_uuid(),
                action_category VARCHAR(50) NOT NULL,
                action_type VARCHAR(100) NOT NULL,
                action_status VARCHAR(20) DEFAULT 'SUCCESS',
                
                -- Actor
                user_id UUID, -- REFERENCES users(id) removed to avoid dependency issues if users table doesn't exist yet/differs
                user_role VARCHAR(50),
                impersonated_by UUID,
                
                -- Context
                location_id UUID,
                terminal_id UUID,
                session_id VARCHAR(100),
                
                -- Resource
                resource_type VARCHAR(100),
                resource_id VARCHAR(100),
                
                -- Data
                old_values JSONB,
                new_values JSONB,
                delta_amount NUMERIC(15, 2),
                
                -- Flags
                requires_manager_review BOOLEAN DEFAULT FALSE,
                reviewed_by UUID,
                reviewed_at TIMESTAMP,
                review_notes TEXT,
                
                -- Metadata
                ip_address INET,
                user_agent TEXT,
                request_id VARCHAR(100),
                correlation_id VARCHAR(100),
                
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            -- Indices para busqueda rapida
            CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_events(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_events(user_id);
            CREATE INDEX IF NOT EXISTS idx_audit_action_type ON audit_events(action_type);
            CREATE INDEX IF NOT EXISTS idx_audit_requires_review ON audit_events(requires_manager_review) WHERE requires_manager_review = TRUE;
        `);

        console.log('✅ Tabla audit_events creada correctamente.');
    } catch (error) {
        console.error('❌ Error creando tabla:', error);
    } finally {
        await pool.end();
    }
}

main();
