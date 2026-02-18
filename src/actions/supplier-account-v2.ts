'use server';

import { query } from '@/lib/db';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const MAX_FILE_SIZE_MB = 15;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_ROLES = ['ADMIN', 'GERENTE_GENERAL', 'MANAGER', 'QF', 'WAREHOUSE', 'CONTADOR'];

const UploadAccountDocSchema = z.object({
    supplierId: z.string().uuid(),
    type: z.enum(['FACTURA', 'NOTA_CREDITO']),
    invoiceNumber: z.string().min(1).max(60),
    issueDate: z.string().optional(),
    dueDate: z.string().optional(),
    amount: z.number().min(0).optional(),
    status: z.enum(['PENDING', 'PAID', 'CANCELLED']).optional(),
    fileName: z.string().min(1).max(255),
    fileMime: z.string().min(1).max(100),
    fileSize: z.number().int().positive(),
    fileBase64: z.string().min(20)
});

const UploadCatalogSchema = z.object({
    supplierId: z.string().uuid(),
    fileName: z.string().min(1).max(255),
    fileMime: z.string().min(1).max(100),
    fileSize: z.number().int().positive(),
    fileBase64: z.string().min(20)
});

const ListDocsSchema = z.object({
    supplierId: z.string().uuid(),
    search: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional()
});

const DocIdSchema = z.string().uuid();

async function getSession() {
    const { getSessionSecure } = await import('@/actions/auth-v2');
    return getSessionSecure();
}

function decodeBase64(input: string): Buffer {
    const base64 = input.includes(',') ? input.split(',')[1] : input;
    return Buffer.from(base64, 'base64');
}

export async function createSupplierAccountDocumentSecure(
    payload: z.infer<typeof UploadAccountDocSchema>
): Promise<{ success: boolean; data?: { id: string }; error?: string }> {
    const session = await getSession();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!ALLOWED_ROLES.includes(session.role)) {
        return { success: false, error: 'Sin permisos para cargar documentos' };
    }

    const parsed = UploadAccountDocSchema.safeParse(payload);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message };
    }

    if (parsed.data.fileSize > MAX_FILE_SIZE_BYTES) {
        return { success: false, error: `Archivo supera ${MAX_FILE_SIZE_MB}MB` };
    }

    const fileBuffer = decodeBase64(parsed.data.fileBase64);
    const id = randomUUID();

    try {
        await query(
            `
            INSERT INTO supplier_account_documents (
                id, supplier_id, type, invoice_number, issue_date, due_date,
                amount, status, file_name, file_mime, file_size, file_data,
                uploaded_by, uploaded_by_name, uploaded_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10, $11, $12,
                $13, $14, NOW()
            )
        `,
            [
                id,
                parsed.data.supplierId,
                parsed.data.type,
                parsed.data.invoiceNumber,
                parsed.data.issueDate || null,
                parsed.data.dueDate || null,
                parsed.data.amount ?? 0,
                parsed.data.status || 'PENDING',
                parsed.data.fileName,
                parsed.data.fileMime,
                parsed.data.fileSize,
                fileBuffer.toString('base64'),
                session.userId,
                session.userName || null
            ]
        );

        await query(
            `
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'SUPPLIER_DOC_UPLOADED', 'SUPPLIER', $2, $3::jsonb, NOW())
        `,
            [
                session.userId,
                parsed.data.supplierId,
                JSON.stringify({
                    type: parsed.data.type,
                    invoice_number: parsed.data.invoiceNumber,
                    file_name: parsed.data.fileName
                })
            ]
        );

        return { success: true, data: { id } };
    } catch (error: any) {
        console.error('[SUPPLIER-ACCOUNT] Upload error:', error);
        return { success: false, error: 'Error al guardar documento' };
    }
}

export async function listSupplierAccountDocumentsSecure(
    params: z.infer<typeof ListDocsSchema>
): Promise<{ success: boolean; data?: any[]; error?: string }> {
    const session = await getSession();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!ALLOWED_ROLES.includes(session.role)) {
        return { success: false, error: 'Sin permisos para ver documentos' };
    }

    const parsed = ListDocsSchema.safeParse(params);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message };
    }

    const conditions: string[] = ['supplier_id = $1'];
    const values: any[] = [parsed.data.supplierId];
    let idx = 2;

    if (parsed.data.search) {
        conditions.push(`invoice_number ILIKE $${idx++}`);
        values.push(`%${parsed.data.search}%`);
    }

    if (parsed.data.from) {
        conditions.push(`uploaded_at >= $${idx++}::timestamp`);
        values.push(parsed.data.from);
    }

    if (parsed.data.to) {
        conditions.push(`uploaded_at <= $${idx++}::timestamp`);
        values.push(parsed.data.to);
    }

    try {
        const res = await query(
            `
            SELECT
                id, supplier_id, type, invoice_number, issue_date, due_date,
                amount, status, file_name, file_mime, file_size,
                uploaded_by, uploaded_by_name, uploaded_at
            FROM supplier_account_documents
            WHERE ${conditions.join(' AND ')}
            ORDER BY uploaded_at DESC
        `,
            values
        );

        const rows = res.rows.map((row: any) => ({
            ...row,
            issue_date: row.issue_date ? new Date(row.issue_date).toISOString() : null,
            due_date: row.due_date ? new Date(row.due_date).toISOString() : null,
            uploaded_at: row.uploaded_at ? new Date(row.uploaded_at).toISOString() : null
        }));

        return { success: true, data: rows };
    } catch (error: any) {
        console.error('[SUPPLIER-ACCOUNT] List error:', error);
        return { success: false, error: 'Error cargando documentos' };
    }
}

export async function getSupplierAccountDocumentFileSecure(
    docId: string
): Promise<{ success: boolean; data?: { base64: string; fileName: string; fileMime: string }; error?: string }> {
    const session = await getSession();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!ALLOWED_ROLES.includes(session.role)) {
        return { success: false, error: 'Sin permisos para descargar documentos' };
    }

    const parsed = DocIdSchema.safeParse(docId);
    if (!parsed.success) return { success: false, error: 'ID inválido' };

    try {
        const res = await query(
            `
            SELECT file_name, file_mime, file_data
            FROM supplier_account_documents
            WHERE id = $1
        `,
            [docId]
        );
        if (res.rows.length === 0) {
            return { success: false, error: 'Documento no encontrado' };
        }
        const row = res.rows[0];
        return {
            success: true,
            data: {
                base64: row.file_data?.toString('base64') || '',
                fileName: row.file_name,
                fileMime: row.file_mime
            }
        };
    } catch (error: any) {
        console.error('[SUPPLIER-ACCOUNT] Download error:', error);
        return { success: false, error: 'Error descargando documento' };
    }
}

export async function deleteSupplierAccountDocumentSecure(
    docId: string
): Promise<{ success: boolean; error?: string }> {
    const session = await getSession();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!ALLOWED_ROLES.includes(session.role)) {
        return { success: false, error: 'Sin permisos para eliminar documentos' };
    }
    const parsed = DocIdSchema.safeParse(docId);
    if (!parsed.success) return { success: false, error: 'ID inválido' };

    try {
        const res = await query(
            `
            DELETE FROM supplier_account_documents
            WHERE id = $1
            RETURNING supplier_id, invoice_number, file_name
        `,
            [docId]
        );
        if (res.rows.length === 0) {
            return { success: false, error: 'Documento no encontrado' };
        }
        const row = res.rows[0];
        await query(
            `
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'SUPPLIER_DOC_DELETED', 'SUPPLIER', $2, $3::jsonb, NOW())
        `,
            [
                session.userId,
                row.supplier_id,
                JSON.stringify({ invoice_number: row.invoice_number, file_name: row.file_name })
            ]
        );
        return { success: true };
    } catch (error: any) {
        console.error('[SUPPLIER-ACCOUNT] Delete error:', error);
        return { success: false, error: 'Error al eliminar documento' };
    }
}

export async function createSupplierCatalogFileSecure(
    payload: z.infer<typeof UploadCatalogSchema>
): Promise<{ success: boolean; data?: { id: string }; error?: string }> {
    const session = await getSession();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!ALLOWED_ROLES.includes(session.role)) {
        return { success: false, error: 'Sin permisos para cargar catálogos' };
    }

    const parsed = UploadCatalogSchema.safeParse(payload);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message };
    }

    if (parsed.data.fileSize > MAX_FILE_SIZE_BYTES) {
        return { success: false, error: `Archivo supera ${MAX_FILE_SIZE_MB}MB` };
    }

    const fileBuffer = decodeBase64(parsed.data.fileBase64);
    const id = randomUUID();

    try {
        await query(
            `
            INSERT INTO supplier_catalog_files (
                id, supplier_id, file_name, file_mime, file_size, file_data,
                uploaded_by, uploaded_by_name, uploaded_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, NOW()
            )
        `,
            [
                id,
                parsed.data.supplierId,
                parsed.data.fileName,
                parsed.data.fileMime,
                parsed.data.fileSize,
                fileBuffer.toString('base64'),
                session.userId,
                session.userName || null
            ]
        );

        await query(
            `
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'SUPPLIER_CATALOG_UPLOADED', 'SUPPLIER', $2, $3::jsonb, NOW())
        `,
            [
                session.userId,
                parsed.data.supplierId,
                JSON.stringify({
                    file_name: parsed.data.fileName
                })
            ]
        );

        return { success: true, data: { id } };
    } catch (error: any) {
        console.error('[SUPPLIER-CATALOG] Upload error:', error);
        return { success: false, error: 'Error al guardar catálogo' };
    }
}

export async function listSupplierCatalogFilesSecure(
    params: z.infer<typeof ListDocsSchema>
): Promise<{ success: boolean; data?: any[]; error?: string }> {
    const session = await getSession();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!ALLOWED_ROLES.includes(session.role)) {
        return { success: false, error: 'Sin permisos para ver catálogos' };
    }

    const parsed = ListDocsSchema.safeParse(params);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message };
    }

    const conditions: string[] = ['supplier_id = $1'];
    const values: any[] = [parsed.data.supplierId];
    let idx = 2;

    if (parsed.data.from) {
        conditions.push(`uploaded_at >= $${idx++}::timestamp`);
        values.push(parsed.data.from);
    }

    if (parsed.data.to) {
        conditions.push(`uploaded_at <= $${idx++}::timestamp`);
        values.push(parsed.data.to);
    }

    try {
        const res = await query(
            `
            SELECT
                id, supplier_id, file_name, file_mime, file_size,
                uploaded_by, uploaded_by_name, uploaded_at
            FROM supplier_catalog_files
            WHERE ${conditions.join(' AND ')}
            ORDER BY uploaded_at DESC
        `,
            values
        );

        const rows = res.rows.map((row: any) => ({
            ...row,
            uploaded_at: row.uploaded_at ? new Date(row.uploaded_at).toISOString() : null
        }));

        return { success: true, data: rows };
    } catch (error: any) {
        console.error('[SUPPLIER-CATALOG] List error:', error);
        return { success: false, error: 'Error cargando catálogos' };
    }
}

export async function getSupplierCatalogFileSecure(
    fileId: string
): Promise<{ success: boolean; data?: { base64: string; fileName: string; fileMime: string }; error?: string }> {
    const session = await getSession();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!ALLOWED_ROLES.includes(session.role)) {
        return { success: false, error: 'Sin permisos para descargar catálogos' };
    }

    const parsed = DocIdSchema.safeParse(fileId);
    if (!parsed.success) return { success: false, error: 'ID inválido' };

    try {
        const res = await query(
            `
            SELECT file_name, file_mime, file_data
            FROM supplier_catalog_files
            WHERE id = $1
        `,
            [fileId]
        );
        if (res.rows.length === 0) {
            return { success: false, error: 'Catálogo no encontrado' };
        }
        const row = res.rows[0];
        return {
            success: true,
            data: {
                base64: row.file_data?.toString('base64') || '',
                fileName: row.file_name,
                fileMime: row.file_mime
            }
        };
    } catch (error: any) {
        console.error('[SUPPLIER-CATALOG] Download error:', error);
        return { success: false, error: 'Error descargando catálogo' };
    }
}

export async function deleteSupplierCatalogFileSecure(
    fileId: string
): Promise<{ success: boolean; error?: string }> {
    const session = await getSession();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!ALLOWED_ROLES.includes(session.role)) {
        return { success: false, error: 'Sin permisos para eliminar catálogos' };
    }
    const parsed = DocIdSchema.safeParse(fileId);
    if (!parsed.success) return { success: false, error: 'ID inválido' };

    try {
        const res = await query(
            `
            DELETE FROM supplier_catalog_files
            WHERE id = $1
            RETURNING supplier_id, file_name
        `,
            [fileId]
        );
        if (res.rows.length === 0) {
            return { success: false, error: 'Catálogo no encontrado' };
        }
        const row = res.rows[0];
        await query(
            `
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'SUPPLIER_CATALOG_DELETED', 'SUPPLIER', $2, $3::jsonb, NOW())
        `,
            [
                session.userId,
                row.supplier_id,
                JSON.stringify({ file_name: row.file_name })
            ]
        );
        return { success: true };
    } catch (error: any) {
        console.error('[SUPPLIER-CATALOG] Delete error:', error);
        return { success: false, error: 'Error al eliminar catálogo' };
    }
}
