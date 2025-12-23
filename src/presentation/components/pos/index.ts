/**
 * POS Module Exports
 * 
 * Centralized exports for all POS-related components
 * Use these imports for clean module boundaries
 * 
 * @example
 * import { ProductSearch, Cart, PaymentModal } from '@/presentation/components/pos';
 */

// Modular Components
export { ProductSearch } from './ProductSearch';
export { Cart } from './Cart';
export { PaymentModal } from './Payment';

// Legacy Modal Components (to be refactored)
export { default as CashControlModal } from './CashControlModal';
export { default as CashManagementModal } from './CashManagementModal';
export { default as CashOutModal } from './CashOutModal';
export { default as ClientPanel } from './ClientPanel';
export { default as CustomerCaptureModal } from './CustomerCaptureModal';
export { default as CustomerSelectModal } from './CustomerSelectModal';
export { default as ManualItemModal } from './ManualItemModal';
export { default as PrescriptionModal } from './PrescriptionModal';
export { default as QueueWidget } from './QueueWidget';
export { default as QuickFractionModal } from './QuickFractionModal';
export { default as ReturnsModal } from './ReturnsModal';
export { ShiftHandoverModal } from './ShiftHandoverModal';
export { default as ShiftManagementModal } from './ShiftManagementModal';
export { default as TransactionHistoryModal } from './TransactionHistoryModal';
export { TransactionListModal } from './TransactionListModal';
