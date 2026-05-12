import { readFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import path from 'node:path';

import { API_NO_STORE_HEADERS } from '@/lib/api-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APK_RELATIVE_PATH = path.join('public', 'downloads', 'farmacias-vallenar.apk');
const APK_FILENAME = 'farmacias-vallenar.apk';
const DOWNLOAD_SECURITY_HEADERS = {
    ...API_NO_STORE_HEADERS,
    'X-Content-Type-Options': 'nosniff',
} as const;

export async function GET() {
    try {
        const filePath = path.join(process.cwd(), APK_RELATIVE_PATH);
        const file = await readFile(filePath);
        const size = statSync(filePath).size;

        return new Response(file, {
            status: 200,
            headers: {
                ...DOWNLOAD_SECURITY_HEADERS,
                'Content-Type': 'application/vnd.android.package-archive',
                'Content-Disposition': `attachment; filename="${APK_FILENAME}"`,
                'Content-Length': String(size),
            },
        });
    } catch {
        return Response.json(
            { success: false, error: 'APK no disponible temporalmente' },
            { status: 404, headers: DOWNLOAD_SECURITY_HEADERS },
        );
    }
}
