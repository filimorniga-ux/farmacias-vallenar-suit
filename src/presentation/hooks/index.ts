/**
 * Presentation Hooks Exports
 * 
 * Custom hooks for POS and business logic
 * 
 * @example
 * import { useCheckout, useProductSearch } from '@/presentation/hooks';
 */

// POS Hooks
export { useCheckout } from './useCheckout';
export type { PaymentMethod, CheckoutState, CheckoutResult, UseCheckoutOptions } from './useCheckout';

export { useProductSearch } from './useProductSearch';
export type { UseProductSearchOptions } from './useProductSearch';

// Re-export existing hooks from src/hooks for convenience
export { usePOSKeyboard } from '../../hooks/usePOSKeyboard';
export { useTerminalSession } from '../../hooks/useTerminalSession';
export { useNetworkStatus } from '../../hooks/useNetworkStatus';
