
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { InventoryBatch, EmployeeProfile, SaleItem, PurchaseOrder, QueueTicket, ClinicalAnalysisResult, Role } from '../../domain/types';

// --- MOCK DATA ---
const MOCK_INVENTORY: InventoryBatch[] = [
    { id: 'A100', name: 'Paracetamol 500mg', dci: 'Paracetamol', sku: 'A100', category: 'MEDICAMENTO', saleCondition: 'VD', isBioequivalent: true, isColdChain: false, isCommissionable: false, stockActual: 1500, stockMin: 100, batchCode: 'P-123', expiryDate: '2026-10-01', supplierId: 'LABCHILE', price: 990 },
    { id: 'B200', name: 'Insulina NPH', dci: 'Insulina', sku: 'B200', category: 'MEDICAMENTO', saleCondition: 'R', isBioequivalent: false, isColdChain: true, isCommissionable: false, stockActual: 20, stockMin: 10, batchCode: 'IN-456', expiryDate: '2025-03-01', supplierId: 'NOVONORD', price: 15990 },
    { id: 'C300', name: 'Maam Crema Antiestrias', dci: 'N/A', sku: 'C300', category: 'RETAIL_BELLEZA', saleCondition: 'VD', isBioequivalent: false, isColdChain: false, isCommissionable: true, stockActual: 50, stockMin: 20, batchCode: 'M-789', supplierId: 'M-LAB', price: 15000 },
];

const MOCK_EMPLOYEES: EmployeeProfile[] = [
    { id: 'u1', name: 'Miguel Pérez (Admin)', rut: '18.123.456-K', role: 'ADMIN', baseSalary: 2500000, commissionRate: 0.05, lastClockIn: 0, lastClockOut: 0, isClockedIn: false },
    { id: 'u2', name: 'Javiera Rojas (QF)', rut: '15.555.555-K', role: 'QF', baseSalary: 1800000, commissionRate: 0, lastClockIn: 0, lastClockOut: 0, isClockedIn: false },
];
const MOCK_QUEUE: QueueTicket[] = [{ number: 'A-001', status: 'CALLING', timestamp: Date.now() - 60000 }];

// --- ESTADO GLOBAL ---
interface PharmaState {
    inventory: InventoryBatch[];
    employees: EmployeeProfile[];
    queue: QueueTicket[];
    cart: SaleItem[];
    user: EmployeeProfile | null;
    isOnline: boolean;
    clinicalResult: ClinicalAnalysisResult | null;
    purchaseOrders: PurchaseOrder[];

    // Acciones
    addToCart: (item: InventoryBatch, quantity: number) => void;
    processSale: () => void;
    generateQueueTicket: () => void;
    markAttendance: (employeeId: string, type: 'IN' | 'OUT' | 'BREAK') => void;
    registerStockMovement: (itemId: string, qty: number) => void;
}

export const usePharmaStore = create<PharmaState>()(
    persist(
        (set, get) => ({
            inventory: MOCK_INVENTORY,
            employees: MOCK_EMPLOYEES,
            queue: MOCK_QUEUE,
            cart: [],
            user: MOCK_EMPLOYEES[0],
            isOnline: true,
            clinicalResult: null,
            purchaseOrders: [],

            // --- Implementaciones simplificadas ---
            addToCart: (item, quantity) => set(state => ({
                cart: [...state.cart, { itemId: item.id, name: item.name, price: item.price, quantity, isCommissionable: item.isCommissionable }]
            })),
            processSale: () => {
                const total = get().cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
                alert(`Simulando venta por CLP $${total}. Boleta emitida.`);
                set({ cart: [] });
            },
            generateQueueTicket: () => {
                const newNumber = `A-${String(get().queue.length + 1).padStart(3, '0')}`;
                const newTicket: QueueTicket = { number: newNumber, status: 'WAITING', timestamp: Date.now() };
                set(state => ({ queue: [...state.queue, newTicket] }));
                alert(`Ticket generado: ${newNumber}`);
            },
            markAttendance: (employeeId, type) => {
                alert(`Asistencia marcada: ${employeeId} - ${type}`);
            },
            registerStockMovement: (itemId, qty) => {
                set(state => ({
                    inventory: state.inventory.map(item =>
                        item.id === itemId ? { ...item, stockActual: item.stockActual + qty } : item
                    ),
                }));
            }
        }),
        {
            name: 'pharma-synapse-storage',
        }
    )
);
