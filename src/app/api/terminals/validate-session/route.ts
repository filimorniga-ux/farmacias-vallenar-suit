import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { sessionId, terminalId } = body;

        if (!sessionId || !terminalId) {
            return NextResponse.json(
                { success: false, error: 'sessionId y terminalId requeridos' },
                { status: 400 }
            );
        }

        // Verificar que la sesión existe y está activa
        const result = await query(`
            SELECT 
                s.id,
                s.status,
                s.opened_at,
                s.user_id,
                t.status AS terminal_status
            FROM cash_register_sessions s
            JOIN terminals t ON s.terminal_id = t.id
            WHERE s.id = $1 AND s.terminal_id = $2
        `, [sessionId, terminalId]);

        if (result.rows.length === 0) {
            return NextResponse.json({
                success: true,
                valid: false,
                error: 'Sesión no encontrada'
            });
        }

        const session = result.rows[0];

        // Validar que esté activa
        if (session.status !== 'OPEN' || session.terminal_status !== 'OPEN') {
            return NextResponse.json({
                success: true,
                valid: false,
                error: 'Sesión cerrada'
            });
        }

        // Validar que no sea muy antigua (>24h)
        // Ensure opened_at is treated as Date. 
        // Postgres returns Date object in node-postgres usually.
        const openedAt = new Date(session.opened_at);
        const now = new Date();
        const hoursSinceOpen = (now.getTime() - openedAt.getTime()) / (1000 * 60 * 60);

        if (hoursSinceOpen > 24) {
            return NextResponse.json({
                success: true,
                valid: false,
                error: 'Sesión expirada (>24h)'
            });
        }

        return NextResponse.json({
            success: true,
            valid: true
        });

    } catch (error: any) {
        console.error('Error validando sesión:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
