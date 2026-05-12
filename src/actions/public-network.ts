
'use server';

import { getPublicLocationsSecure } from './public-network-v2';

export interface PublicLocation {
    id: string;
    name: string;
    address: string;
    type: 'STORE' | 'WAREHOUSE' | 'HQ';
}

/**
 * 🌍 Public: Get Locations
 * Accessible without authentication to allow context selection before login.
 * Returns only non-sensitive data.
 */
export async function getPublicLocations(): Promise<{ success: boolean; data?: PublicLocation[]; error?: string }> {
    const result = await getPublicLocationsSecure();

    if (result.success) {
        return result;
    }

    return { success: false, error: result.userMessage || result.error };
}
