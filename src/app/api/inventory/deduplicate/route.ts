import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const action = body.action || 'ANALYZE';

        const client = await pool.connect();
        try {
            const duplicatesQuery = `
                SELECT sku, COUNT(*) as count, array_agg(id) as ids
                FROM products
                GROUP BY sku
                HAVING COUNT(*) > 1
            `;
            const { rows: duplicateGroups } = await client.query(duplicatesQuery);

            if (action === 'ANALYZE_DUPLICATES') {
                const stats = duplicateGroups.map(g => ({
                    sku: g.sku,
                    count: g.count,
                    name: 'Producto Duplicado'
                }));
                return NextResponse.json({
                    success: true,
                    duplicates: stats,
                    message: `Se encontraron ${duplicateGroups.length} grupos de duplicados.`
                });
            }

            if (action === 'MERGE_DUPLICATES') {
                await client.query('BEGIN');
                let mergedCount = 0;

                for (const group of duplicateGroups) {
                    const sku = group.sku;

                    const { rows: products } = await client.query(
                        'SELECT * FROM products WHERE sku = $1 ORDER BY created_at DESC',
                        [sku]
                    );

                    const master = products[0];
                    const duplicates = products.slice(1);

                    const totalStockToAdd = duplicates.reduce((sum, p) => sum + (p.stock_actual || 0), 0);

                    await client.query(
                        'UPDATE products SET stock_actual = stock_actual + $1 WHERE id = $2',
                        [totalStockToAdd, master.id]
                    );

                    const duplicateIds = duplicates.map(d => d.id);
                    await client.query(
                        'DELETE FROM products WHERE id = ANY($1)',
                        [duplicateIds]
                    );

                    mergedCount++;
                }

                await client.query('COMMIT');
                return NextResponse.json({
                    success: true,
                    mergedCount,
                    message: `Se fusionaron ${mergedCount} productos correctamente.`
                });
            }

            return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Deduplicate error:', error);
        return NextResponse.json(
            { error: 'Error al procesar duplicados', details: (error as Error).message },
            { status: 500 }
        );
    }
}
