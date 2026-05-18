import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockReadFile, mockStatSync } = vi.hoisted(() => ({
    mockReadFile: vi.fn(),
    mockStatSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
    readFile: mockReadFile,
}));

vi.mock('node:fs', () => ({
    statSync: mockStatSync,
}));

import { GET } from '@/app/api/downloads/android-apk/route';

describe('GET /api/downloads/android-apk', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('sirve solo el APK público fijo con cabeceras de descarga seguras', async () => {
        mockReadFile.mockResolvedValueOnce(Buffer.from('apk'));
        mockStatSync.mockReturnValueOnce({ size: 3 });

        const response = await GET();

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('application/vnd.android.package-archive');
        expect(response.headers.get('content-disposition')).toBe('attachment; filename="farmacias-vallenar.apk"');
        expect(response.headers.get('content-length')).toBe('3');
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        expect(mockReadFile).toHaveBeenCalledWith(
            expect.stringContaining('/public/downloads/farmacias-vallenar.apk'),
        );
        await expect(response.text()).resolves.toBe('apk');
    });

    it('redacta error de archivo y mantiene respuesta no cacheable', async () => {
        mockReadFile.mockRejectedValueOnce(new Error('ENOENT /tmp/internal/path'));

        const response = await GET();
        const payload = await response.json();

        expect(response.status).toBe(404);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        expect(payload).toEqual({
            success: false,
            error: 'APK no disponible temporalmente',
        });
        expect(JSON.stringify(payload)).not.toContain('ENOENT');
    });
});
