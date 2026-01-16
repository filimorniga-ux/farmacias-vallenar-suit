
'use server';

import { POSAssistantService, POSCartItem, POSAnalysisResult } from '../../services/pos-assistant';

export async function analyzeSalesCart(items: POSCartItem[]): Promise<{ success: boolean; data?: POSAnalysisResult }> {
    try {
        const result = await POSAssistantService.analyzeCart(items);
        return { success: true, data: result };
    } catch (error) {
        console.error("Action Error:", error);
        return { success: false };
    }
}
