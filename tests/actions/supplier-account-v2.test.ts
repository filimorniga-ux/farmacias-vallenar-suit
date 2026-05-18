import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockGetSessionSecure = vi.fn();

vi.mock('@/lib/db', () => ({
    query: (...args: unknown[]) => mockQuery(...args),
}));

vi.mock('@/actions/auth-v2', () => ({
    getSessionSecure: () => mockGetSessionSecure(),
}));

import {
    createSupplierAccountDocumentSecure,
    deleteSupplierAccountDocumentSecure,
    getSupplierAccountDocumentFileSecure,
    listSupplierAccountDocumentsSecure,
} from '@/actions/supplier-account-v2';

describe('Supplier Account V2', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSessionSecure.mockResolvedValue({
            userId: 'user-1',
            role: 'MANAGER',
            userName: 'Manager',
        });
        mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    });

    it('rechaza carga de documento sin sesión', async () => {
        mockGetSessionSecure.mockResolvedValueOnce(null);

        const result = await createSupplierAccountDocumentSecure({
            supplierId: '123e4567-e89b-12d3-a456-426614174000',
            type: 'FACTURA',
            invoiceNumber: 'F-100',
            fileName: 'factura.pdf',
            fileMime: 'application/pdf',
            fileSize: 2048,
            fileBase64: 'data:application/pdf;base64,ZmFrZS1maWxlLWNvbnRlbnQ=',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No autenticado');
    });

    it('rechaza documentos contables para rol sin permisos', async () => {
        mockGetSessionSecure.mockResolvedValueOnce({
            userId: 'warehouse-1',
            role: 'WAREHOUSE',
            userName: 'Bodega',
        });

        const result = await createSupplierAccountDocumentSecure({
            supplierId: '123e4567-e89b-12d3-a456-426614174000',
            type: 'FACTURA',
            invoiceNumber: 'F-100',
            fileName: 'factura.pdf',
            fileMime: 'application/pdf',
            fileSize: 2048,
            fileBase64: 'data:application/pdf;base64,ZmFrZS1maWxlLWNvbnRlbnQ=',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Sin permisos');
    });

    it('rechaza listar documentos para proveedor inexistente', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await listSupplierAccountDocumentsSecure({
            supplierId: '123e4567-e89b-12d3-a456-426614174000',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Proveedor no encontrado');
    });

    it('rechaza descargar documento inexistente', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await getSupplierAccountDocumentFileSecure('123e4567-e89b-12d3-a456-426614174000');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Documento no encontrado');
    });

    it('rechaza eliminar documento inexistente', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await deleteSupplierAccountDocumentSecure('123e4567-e89b-12d3-a456-426614174000');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Documento no encontrado');
    });
});
