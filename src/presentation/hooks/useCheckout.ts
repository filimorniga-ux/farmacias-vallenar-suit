/**
 * useCheckout Hook
 * 
 * Encapsulates all checkout/payment logic extracted from POSMainScreen.tsx
 * Handles: payment processing, DTE generation, loyalty points, printing
 * 
 * @version 1.0.0
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { usePharmaStore } from '../store/useStore';
import { useLocationStore } from '../store/useLocationStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { shouldGenerateDTE } from '../../domain/logic/sii_dte';
import { printSaleTicket } from '../utils/print-utils';
import { Customer, CartItem } from '../../domain/types';

export type PaymentMethod = 'CASH' | 'DEBIT' | 'CREDIT' | 'TRANSFER';

export interface CheckoutState {
    isProcessing: boolean;
    paymentMethod: PaymentMethod;
    transferId: string;
    pointsToRedeem: number;
    autoPrint: boolean;
}

export interface CheckoutResult {
    success: boolean;
    saleId?: string;
    dteFolio?: string;
    error?: string;
}

export interface UseCheckoutOptions {
    onSuccess?: (result: CheckoutResult) => void;
    onError?: (error: string) => void;
}

export function useCheckout(options: UseCheckoutOptions = {}) {
    const {
        cart,
        currentShift,
        currentCustomer,
        processSale,
        redeemPoints,
        calculateDiscountValue,
        user, // Current seller
    } = usePharmaStore();

    const { currentLocation } = useLocationStore();
    const { enable_sii_integration, hardware } = useSettingsStore();

    // State
    const [isProcessing, setIsProcessing] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
    const [transferId, setTransferId] = useState('');
    const [pointsToRedeem, setPointsToRedeem] = useState(0);
    const [autoPrint, setAutoPrint] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('pos_auto_print') !== 'false';
        }
        return true;
    });

    // Persist autoPrint preference
    const updateAutoPrint = useCallback((value: boolean) => {
        setAutoPrint(value);
        if (typeof window !== 'undefined') {
            localStorage.setItem('pos_auto_print', String(value));
        }
    }, []);

    // Calculate totals
    const cartTotal = cart.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0);
    const pointsDiscount = pointsToRedeem > 0 ? calculateDiscountValue(pointsToRedeem) : 0;
    const finalTotal = Math.max(0, cartTotal - pointsDiscount);

    // Validation
    const canCheckout = useCallback(() => {
        if (cart.length === 0) {
            return { valid: false, error: 'El carrito está vacío' };
        }
        if (!currentShift || currentShift.status === 'CLOSED') {
            return { valid: false, error: 'Debe abrir caja antes de vender' };
        }
        return { valid: true };
    }, [cart, currentShift]);

    // Main checkout function
    const checkout = useCallback(async (): Promise<CheckoutResult> => {
        // Prevent double-click
        if (isProcessing) {
            return { success: false, error: 'Procesando...' };
        }

        // Validate
        const validation = canCheckout();
        if (!validation.valid) {
            toast.error(validation.error);
            return { success: false, error: validation.error };
        }

        setIsProcessing(true);

        try {
            // Determine DTE Status
            let dteResult = { shouldGenerate: false, status: 'FISCALIZED_BY_VOUCHER' as string };
            let dteFolio: string | undefined;

            if (enable_sii_integration) {
                const check = shouldGenerateDTE(paymentMethod);
                dteResult = { shouldGenerate: check.shouldGenerate, status: check.status };
                dteFolio = dteResult.shouldGenerate
                    ? Math.floor(Math.random() * 100000).toString()
                    : undefined;
            }

            // Redeem loyalty points if applicable
            if (currentCustomer && pointsToRedeem > 0) {
                const redeemSuccess = redeemPoints(currentCustomer.id, pointsToRedeem);
                if (!redeemSuccess) {
                    setIsProcessing(false);
                    return { success: false, error: 'Error al canjear puntos' };
                }
            }

            // Capture sale data for printing (cart will be cleared after processSale)
            const saleToPrint = {
                id: `V-${Date.now()}`,
                timestamp: Date.now(),
                items: [...cart],
                total: finalTotal,
                payment_method: paymentMethod,
                customer: currentCustomer || undefined,
                seller_id: user?.id || 'UNKNOWN',
                seller_name: user?.name || 'Vendedor',
                transfer_id: paymentMethod === 'TRANSFER' ? (transferId || 'SIN_ID_PENDIENTE') : undefined,
                dte_status: dteResult.status,
                dte_folio: dteFolio,
                is_internal_ticket: !enable_sii_integration,
                points_redeemed: pointsToRedeem,
                points_discount: pointsDiscount
            };

            // Process sale
            const success = await processSale(paymentMethod, currentCustomer || undefined);

            if (!success) {
                setIsProcessing(false);
                const error = 'Error al procesar la venta. Intente nuevamente.';
                toast.error(error);
                options.onError?.(error);
                return { success: false, error };
            }

            // Auto-print if enabled
            if (autoPrint) {
                try {
                    // Cast to any for print compatibility - print-utils handles missing fields gracefully
                    await printSaleTicket(saleToPrint as any, currentLocation?.config, hardware, {
                        cashierName: user?.name,
                        branchName: currentLocation?.name
                    });
                } catch (printError) {
                    console.error('Print error:', printError);
                    // Don't fail the sale if print fails
                    toast.warning('Venta exitosa pero hubo un error al imprimir');
                }
            }

            // Success message
            if (enable_sii_integration && dteResult.shouldGenerate) {
                toast.success(`¡Venta Exitosa! Boleta Nº ${dteFolio} generada.`, { duration: 3000 });
            } else if (!enable_sii_integration) {
                toast.success('¡Venta Exitosa! Comprobante Interno Generado.', { duration: 3000 });
            } else {
                toast.success('¡Venta Exitosa! Fiscalizada por Voucher.', { duration: 3000 });
            }

            // Reset state
            setPaymentMethod('CASH');
            setTransferId('');
            setPointsToRedeem(0);

            const result: CheckoutResult = {
                success: true,
                saleId: saleToPrint.id,
                dteFolio
            };

            options.onSuccess?.(result);
            return result;

        } catch (error) {
            console.error('Checkout error:', error);
            const errorMsg = 'Error inesperado al finalizar venta';
            toast.error(errorMsg);
            options.onError?.(errorMsg);
            return { success: false, error: errorMsg };
        } finally {
            setIsProcessing(false);
        }
    }, [
        isProcessing, canCheckout, enable_sii_integration, paymentMethod,
        currentCustomer, pointsToRedeem, redeemPoints, cart, finalTotal,
        transferId, pointsDiscount, processSale, autoPrint, currentLocation,
        hardware, options
    ]);

    // Reset all checkout state
    const reset = useCallback(() => {
        setPaymentMethod('CASH');
        setTransferId('');
        setPointsToRedeem(0);
    }, []);

    return {
        // State
        isProcessing,
        paymentMethod,
        transferId,
        pointsToRedeem,
        autoPrint,

        // Computed
        cartTotal,
        pointsDiscount,
        finalTotal,
        canCheckout: canCheckout().valid,

        // Actions
        setPaymentMethod,
        setTransferId,
        setPointsToRedeem,
        setAutoPrint: updateAutoPrint,
        checkout,
        reset
    };
}

export default useCheckout;
