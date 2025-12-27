'use server';

import { query } from '@/lib/db';

export interface LegalDocument {
    id: string;
    title: string;
    filename: string;
    category: string;
    upload_date: Date;
}

export async function getLegalDocumentsSecure() {
    try {
        const result = await query(
            `SELECT id, title, filename, category, upload_date 
             FROM legal_documents 
             WHERE is_active = true 
             ORDER BY category ASC, title ASC`
        );

        // Serialize dates
        const docs = result.rows.map(row => ({
            ...row,
            upload_date: row.upload_date.toISOString()
        }));

        return { success: true, data: docs };
    } catch (error) {
        console.error('Error fetching legal documents:', error);
        return { success: false, error: 'Failed to load legal documents' };
    }
}
