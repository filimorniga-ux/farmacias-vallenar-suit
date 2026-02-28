/**
 * Barrel export para el módulo offline
 *
 * Importar desde aquí para acceso unificado a todas las funciones offline.
 * Ejemplo: import { mirrorStoreToSQLite, saveOfflineClient } from '@/lib/offline';
 */

// Core: SQLite ↔ Store bridge
export {
    mirrorStoreToSQLite,
    loadFromSQLite,
    saveOfflineSale,
    saveOfflineCashOperation,
    saveOfflineWMSMovement,
    initPullHandler,
} from './OfflineInterceptor';

// Secondary modules: CRM, RRHH, Tesorería, etc.
export {
    saveOfflineClient,
    saveOfflineLoyaltyTransaction,
    saveOfflineEmployee,
    saveOfflineAttendance,
    saveOfflineSchedule,
    saveOfflineTreasuryAccount,
    saveOfflineTreasuryMovement,
    saveOfflineMonthlyClosing,
    saveOfflineSetting,
    getOfflineSetting,
    getAllOfflineSettings,
    updateOfflineNetworkStatus,
    mirrorSecondaryToSQLite,
} from './OfflineInterceptorSecondary';

// Reports & IA cache
export {
    generateOfflineDailySummary,
    getOfflineDailySummary,
    saveReportSnapshot,
    getReportSnapshots,
    cacheIASuggestions,
    getCachedIASuggestions,
    cleanExpiredSuggestions,
    fetchAndCacheIASuggestions,
} from './OfflineReportsIA';
