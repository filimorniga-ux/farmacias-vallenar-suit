
import { NextResponse } from 'next/server';
import { processImportBatch } from '@/services/inventory-matcher';

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const batchSize = body.batchSize || 20; // Default smaller for web request timeout safety

        // Execute batch process
        const result = await processImportBatch(batchSize);

        return NextResponse.json({
            success: true,
            processed: result.processed,
            message: result.message || "Batch processed successfully"
        });

    } catch (error: any) {
        console.error("API Error processing inventory:", error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
