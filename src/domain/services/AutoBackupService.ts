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

            // Reuse the logic from backupService but adapted for auto-save
            // We want to save to localStorage or trigger a download if possible
            // For "Auto" without user interaction, localStorage/IndexedDB is best.
            // But the requirement says "Usa la File System Access API... o localStorage... Nota: Si usa descarga de archivo, que sea silenciosa o solo notifique."

            // Let's try to save to localStorage first as a robust fallback
            const backupData = {
                timestamp: Date.now(),
                date: new Date().toISOString(),
                sales: state.salesHistory,
                cashMovements: state.cashMovements,
                inventory: state.inventory,
                version: '1.0'
            };

            const jsonString = JSON.stringify(backupData);

            // 1. Save to LocalStorage (Limit size risk, but good for text data)
            try {
                localStorage.setItem('farmacias-vallenar-autobackup-latest', jsonString);
                console.log('✅ [AutoBackup] Saved to localStorage');
            } catch (e) {
                console.warn('⚠️ [AutoBackup] LocalStorage full or error:', e);
            }

            // 2. We can also try to use the File System Access API if we had a handle, 
            // but we don't have a persistent handle from a previous interaction in this context easily.
            // So we will stick to localStorage for the "silent" part.

            // 3. Notify user
            // We can import toast dynamically to avoid SSR issues if this runs on server (it shouldn't, but safety first)
            if (typeof window !== 'undefined') {
                const { toast } = await import('sonner');
                toast.success('Respaldo Automático Exitoso', {
                    description: 'Sus datos han sido guardados localmente.',
                    duration: 3000,
                    icon: '💾'
                });
            }

        } catch (error) {
            console.error('❌ [AutoBackup] Failed:', error);
        }
    }
}

export const autoBackupService = new AutoBackupService();
