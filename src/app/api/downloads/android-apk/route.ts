import { readFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APK_RELATIVE_PATH = path.join('public', 'downloads', 'farmacias-vallenar.apk');
const APK_FILENAME = 'farmacias-vallenar.apk';

export async function GET() {
    try {
        const filePath = path.join(process.cwd(), APK_RELATIVE_PATH);
        const file = await readFile(filePath);
        const size = statSync(filePath).size;

        return new Response(file, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.android.package-archive',
                'Content-Disposition': `attachment; filename="${APK_FILENAME}"`,
                'Content-Length': String(size),
                'Cache-Control': 'no-store, max-age=0',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch {
        return Response.json(
            { success: false, error: 'APK no disponible temporalmente' },
            { status: 404 },
        );
    }
}
