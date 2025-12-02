import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Timescale Cloud
});

export async function POST(request: Request) {
    try {
        const body = await request.json();

        // 1. Security Check
        if (body.confirmation !== 'BORRAR') {
            return NextResponse.json(
                { error: 'Confirmación inválida. Debe escribir BORRAR.' },
                { status: 400 }
            );
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 2. Execute Truncate
            // CASCADE is important to clear related tables if any (like lotes)
            await client.query('TRUNCATE TABLE lotes CASCADE');
            await client.query('TRUNCATE TABLE products CASCADE');

            await client.query('COMMIT');

            return NextResponse.json({
                success: true,
                message: 'Inventario vaciado correctamente.'
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Truncate error:', error);
        return NextResponse.json(
            { error: 'Error al vaciar inventario', details: (error as Error).message },
            { status: 500 }
        );
    }
}
