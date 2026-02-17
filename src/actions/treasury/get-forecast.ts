
'use server';

import { TreasuryService } from '../../services/treasury-forecast';

export async function getTreasuryDashboardData() {
    try {
        const history = await TreasuryService.getHistory();
        const aiResult = await TreasuryService.generateForecast(history);

        return {
            success: true,
            history,
            forecast: aiResult.forecast,
            insights: aiResult.insights
        };
    } catch (error: unknown) {
        console.error("Treasury Action Error:", error);
        const message = error instanceof Error ? error.message : 'Error desconocido';
        return {
            success: false,
            message
        };
    }
}
