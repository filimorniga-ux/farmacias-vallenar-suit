import { useOutboxStore, OutboxItem } from './store/outboxStore';

// Dynamic imports for actions to avoid server-side issues in client context if needed, 
// though these are standard imports for Next.js actions.
import { createCustomerSecure } from '@/actions/customers-v2';
import { adjustCashSecure } from '@/actions/cash-management-v2';
import { adjustStockSecure } from '@/actions/inventory-v2';
import { createProductSecure } from '@/actions/products-v2';

export const processOutboxQueue = async () => {
    // 1. GLOBAL STORE ACCESS
    const {
        queue,
        removeFromOutbox,
        updateOutboxItemStatus,
        isSyncing,
        setSyncing
    } = useOutboxStore.getState();

    // Prevent re-entry if already syncing
    if (isSyncing) {
        console.log('📡 [SyncManager] Sync already in progress, skipping.');
        return;
    }

    // Filter items: pending or error (retriable)
    // Retry logic: If invalid or max retries reached, effectively ignored or handled as conflict
    // Heuristic: Retry items that are PENDING or (ERROR and retryCount < 3)
    const itemsToSync = queue.filter(item =>
        item.status === 'PENDING' ||
        (item.status === 'ERROR' && item.retryCount < 3)
    );

    if (itemsToSync.length === 0) return;

    try {
        console.log(`📡 [SyncManager] Processing ${itemsToSync.length} outbox items...`);
        setSyncing(true);

        for (const item of itemsToSync) {
            try {
                let result: { success: boolean; error?: string } = { success: false, error: 'Unknown action' };

                // Router
                switch (item.type) {
                    case 'CLIENT_CREATE':
                        result = await createCustomerSecure(item.payload);
                        break;
                    case 'CASH_MOVEMENT':
                        result = await adjustCashSecure(item.payload);
                        break;
                    case 'STOCK_ADJUST':
                        result = await adjustStockSecure(item.payload);
                        break;
                    case 'PRODUCT_CREATE':
                        result = await createProductSecure(item.payload);
                        break;
                    default:
                        console.error(`Unknown outbox type: ${item.type}`);
                        // Determine if we should keep it or discard. Discarding is safer to avoid blocking.
                        // Or maybe mark as ERROR.
                        updateOutboxItemStatus(item.id, 'ERROR', `Unknown type: ${item.type}`);
                        continue;
                }

                // 2. RESPONSE VALIDATION (The "Backend says ok false" case)
                if (result.success) {
                    console.log(`✅ [SyncManager] Item ${item.id} (${item.type}) synced successfully`);
                    removeFromOutbox(item.id);
                } else {
                    // Explicitly throw to fall into catch block for uniform handling
                    throw new Error(result.error || 'Server responded with success: false');
                }

            } catch (error: any) {
                // 3. CATCH INTELIGENTE
                console.error(`❌ [SyncManager] Failed to sync ${item.id}:`, error);

                const errorMsg = error.message || 'Unknown error';

                // Determine if it's a CONFLICT (Business Rule preventing success forever)
                const isConflict = checkIsConflict(errorMsg);

                // If it's a conflict, status -> CONFLICT (stops retrying)
                // If it's a generic error, status -> ERROR (can retry if count < 3)
                const newStatus = isConflict ? 'CONFLICT' : 'ERROR';

                updateOutboxItemStatus(item.id, newStatus, errorMsg);
            }
        }
    } finally {
        // 4. BLOCK FINALLY: Ensure isSyncing = false executes ALWAYS
        setSyncing(false);
        console.log('📡 [SyncManager] Sync cycle finished.');
    }
};

// Helper to categorize errors
function checkIsConflict(errorMessage?: string): boolean {
    if (!errorMessage) return false;
    const msg = errorMessage.toLowerCase();

    // Business Logic Errors => Conflict (Stop Retrying)
    if (
        msg.includes('insufficient') ||
        msg.includes('insuficiente') ||
        msg.includes('valid') || // Invalid, Invalido
        msg.includes('pin') ||
        msg.includes('exist') || // Exists, Ya existe
        msg.includes('not found') || // No encontrado (maybe data obsolete?)
        msg.includes('duplicate') ||
        msg.includes('cerrada') || // Caja cerrada
        msg.includes('bloqueado') // Lote bloqueado
    ) {
        return true;
    }

    return false;
}
