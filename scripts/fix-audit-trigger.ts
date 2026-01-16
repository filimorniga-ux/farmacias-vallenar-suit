
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const { Pool } = pg;

async function main() {
    console.log('🔧 Fixing Audit Log Trigger...');

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
    });

    try {
        const query = `
            CREATE OR REPLACE FUNCTION public.audit_log_calculate_checksum()
             RETURNS trigger
             LANGUAGE plpgsql
            AS $function$
            DECLARE
                last_checksum VARCHAR(64);
                record_data TEXT;
            BEGIN
                -- Obtener checksum del último registro (para encadenamiento)
                SELECT checksum INTO last_checksum 
                FROM audit_log 
                ORDER BY created_at DESC, id DESC
                LIMIT 1;
                
                NEW.previous_checksum := COALESCE(last_checksum, 'GENESIS_BLOCK');
                
                -- Construir string para hash
                record_data := concat_ws('|',
                    NEW.id::text,
                    NEW.created_at::text,
                    COALESCE(NEW.user_id::text, 'NULL'),
                    NEW.action_code,
                    NEW.entity_type,
                    COALESCE(NEW.entity_id, 'NULL'),
                    COALESCE(NEW.old_values::text, 'NULL'),
                    COALESCE(NEW.new_values::text, 'NULL'),
                    NEW.previous_checksum
                );
                
                -- Calcular SHA-256 (FIXED: using convert_to instead of cast)
                NEW.checksum := encode(sha256(convert_to(record_data, 'UTF8')), 'hex');
                
                RETURN NEW;
            END;
            $function$;
        `;

        await pool.query(query);
        console.log('✅ Function audit_log_calculate_checksum updated successfully!');

    } catch (error) {
        console.error('❌ Error updating function:', error);
    } finally {
        await pool.end();
    }
}

main();
