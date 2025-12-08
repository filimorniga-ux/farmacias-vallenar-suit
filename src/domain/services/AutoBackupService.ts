import { usePharmaStore } from '../../presentation/store/useStore';
import { generateDailyBackup } from '../logic/backupService';

const BACKUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

class AutoBackupService {
    private intervalId: NodeJS.Timeout | null = null;

    start() {
        if (this.intervalId) return;

        console.log('🔄 [AutoBackup] Service started (Every 30 mins)');

        // Initial backup check (optional, maybe wait for first interval)

        this.intervalId = setInterval(() => {
            this.performBackup();
        }, BACKUP_INTERVAL_MS);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('⏹️ [AutoBackup] Service stopped');
        }
    }

    private async performBackup() {
        try {
            console.log('💾 [AutoBackup] Starting automatic backup...');
            const state = usePharmaStore.getState();
            // Filter by Current Location to avoid backup bloat
            const currentLocationId = state.currentLocationId;

            const backupData = {
                timestamp: Date.now(),
                date: new Date().toISOString(),
                location_id: currentLocationId || 'GLOBAL',
                // Filter Sales by current location (keep unsynced + history of this branch)
                sales: state.salesHistory.filter(s =>
                    s.branch_id === currentLocationId || !s.is_synced
                ),
                cashMovements: state.cashMovements.filter(c => {
                    // Assuming cash movements are local based on session/shift logic in memory
                    //Ideally cashMovements should have branch_id, but usually they are tied to local session
                    return true;
                }),
                inventory: state.inventory, // Keep local inventory (already filtered by fetch)
                version: '1.2'
            };

            const jsonString = JSON.stringify(backupData);

            // 1. Save to LocalStorage (Limit size risk, but good for text data)
            try {
                // Keyed by location for safety
                const key = `farmacias-vallenar-backup-${currentLocationId || 'global'}`;
                localStorage.setItem(key, jsonString);
                console.log(`✅ [AutoBackup] Saved to localStorage (${key})`);
            } catch (e) {
                console.warn('⚠️ [AutoBackup] LocalStorage full or error:', e);
            }

            // 2. We can also try to use the File System Access API if we had a handle, 
            // but we don't have a persistent handle from a previous interaction in this context easily.
            // So we will stick to localStorage for the "silent" part.

            // 3. Notify user (Optional - defined by setting usually)
            // We skip notifications for silent auto-backup to not annoy user every 30 mins
        } catch (error) {
            console.error('❌ [AutoBackup] Failed:', error);
        }
    }

    /**
     * Manual Export for "Physicial Backup" (Panic Button)
     */
    async downloadPhysicalBackup() {
        try {
            const state = usePharmaStore.getState();
            const currentLocationId = state.currentLocationId;
            const branchName = state.locations.find(l => l.id === currentLocationId)?.name || 'GLOBAL';

            const backupData = {
                timestamp: Date.now(),
                date: new Date().toISOString(),
                location: branchName,
                sales: state.salesHistory,
                inventory: state.inventory,
                cash: state.cashMovements,
                type: 'MANUAL_EXPORT'
            };

            const jsonString = JSON.stringify(backupData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });

            // Trigger Download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `RESPALDO_${branchName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            return true;
        } catch (e) {
            console.error('Export failed:', e);
            return false;
        }
    }

    /**
     * Restore System State from Backup File
     */
    async restoreFromBackupFile(file: File): Promise<{ success: boolean; message: string }> {
        return new Promise((resolve) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const text = e.target?.result as string;
                    if (!text) throw new Error('Archivo vacío');

                    const data = JSON.parse(text);

                    // 1. Validate Structure
                    if (!data.sales || !data.cash || !data.location) {
                        throw new Error('Formato de respaldo inválido. Faltan cabeceras críticas.');
                    }

                    /*
                    // Optional: Version Validation
                    if (data.version && data.version !== '1.2') {
                        console.warn('⚠️ Version mismatch. Attempting partial restore...');
                    }
                    */

                    console.log(`📦 [AutoBackup] Restoring backup from: ${data.timestamp} (${data.date})`);

                    // 2. Inject into Store
                    const state = usePharmaStore.getState();

                    // Restore Sales
                    // NOTE: This replaces local history. In a synced app, we might want to merge,
                    // but "Restore" usually means "Reset to this state".
                    usePharmaStore.setState({
                        salesHistory: data.sales || [],
                        cashMovements: data.cash || [],
                        // Restore inventory if present, otherwise keep current
                        inventory: data.inventory || state.inventory
                    });

                    // 3. Persist to LocalStorage (to survive clean reload)
                    // We overwrite the auto-backup slot or a specific slot
                    const currentState = usePharmaStore.getState();

                    // Force save the newly restored state to persistence layer
                    // Assuming zustand persist middleware handles 'farmacias-vallenar-storage'
                    // We can also update our custom backup key
                    try {
                        const key = `farmacias-vallenar-backup-${data.location || 'global'}`;
                        localStorage.setItem(key, JSON.stringify(data));
                    } catch (err) {
                        console.warn('LocalStorage save failed during restore', err);
                    }

                    resolve({ success: true, message: 'Restauración completada con éxito.' });

                } catch (error: any) {
                    console.error('❌ Restore failed:', error);
                    resolve({ success: false, message: error.message || 'Error al leer el archivo de respaldo.' });
                }
            };

            reader.onerror = () => {
                resolve({ success: false, message: 'Error de lectura de archivo.' });
            };

            reader.readAsText(file);
        });
    }
}

export const autoBackupService = new AutoBackupService();
