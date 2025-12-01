import { SaleTransaction, CashMovement, InventoryBatch } from '../types';

interface BackupData {
    timestamp: number;
    date_string: string;
    sales: SaleTransaction[];
    cash_movements: CashMovement[];
    inventory_snapshot: {
        total_items: number;
        items: InventoryBatch[];
    };
    metadata: {
        version: string;
        generated_by: string;
    };
}

export const generateDailyBackup = (
    sales: SaleTransaction[],
    cashMovements: CashMovement[],
    inventory: InventoryBatch[]
): void => {
    const now = new Date();
    const dateString = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const timestamp = now.getTime();

    // Filter for today's data (optional, but requested "Daily Backup")
    // However, for a "Black Box" backup, it might be safer to dump everything available in the store
    // or at least everything from the current shift. 
    // The requirement says "Recopile todas las ventas del día".

    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const todaysSales = sales.filter(s => s.timestamp >= startOfDay);
    const todaysMovements = cashMovements.filter(m => m.timestamp >= startOfDay);

    const backupData: BackupData = {
        timestamp,
        date_string: dateString,
        sales: todaysSales,
        cash_movements: todaysMovements,
        inventory_snapshot: {
            total_items: inventory.length,
            items: inventory // Full inventory snapshot is requested
        },
        metadata: {
            version: '1.0',
            generated_by: 'Farmacias Vallenar Suit Auto-Backup'
        }
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `Respaldo_Vallenar_${dateString}.json`;
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};
