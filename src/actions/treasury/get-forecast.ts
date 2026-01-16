
'use server';

import { TreasuryService, DailyFinancials, TreasuryForecast, TreasuryInsight } from '../../services/treasury-forecast';

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
    } catch (error: any) {
        console.error("Treasury Action Error:", error);
        return {
            success: false,
            message: error.message
        };
    }
}
