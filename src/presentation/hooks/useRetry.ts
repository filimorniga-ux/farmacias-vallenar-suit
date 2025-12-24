'use client';

/**
 * 🔄 USE RETRY HOOK
 * Pharma-Synapse v3.1 - Farmacias Vallenar
 * 
 * Hook de React para ejecutar operaciones con reintentos automáticos.
 * Diseñado para manejar errores de concurrencia (SERIALIZABLE conflicts).
 * 
 * @version 1.0.0
 * @date 2024-12-24
 */

import { useState, useCallback, useRef } from 'react';
import { 
    withServerActionRetry, 
    type RetryOptions,
    isRetriableError 
} from '@/lib/retry';

// =====================================================
// TIPOS
// =====================================================

export interface UseRetryState {
    /** Indica si hay un reintento en progreso */
    isRetrying: boolean;
    /** Número del intento actual (1-based) */
    currentAttempt: number;
    /** Total de intentos realizados en la última operación */
    totalAttempts: number;
    /** Último error encontrado (si hubo reintentos) */
    lastRetryError: string | null;
    /** Si la operación se completó después de reintentos */
    recoveredFromRetry: boolean;
}

export interface UseRetryOptions extends Omit<RetryOptions, 'onRetry'> {
    /** Callback cuando inicia un reintento */
    onRetryStart?: (attempt: number, error: string | null) => void;
    /** Callback cuando se recupera después de reintentos */
    onRecovery?: (attempts: number) => void;
    /** Callback cuando se agotan los reintentos */
    onExhausted?: (attempts: number, lastError: string) => void;
}

export interface UseRetryReturn<T> {
    /** Ejecuta la operación con reintentos automáticos */
    executeWithRetry: (operation: () => Promise<T>) => Promise<T>;
    /** Estado actual de los reintentos */
    retryState: UseRetryState;
    /** Reinicia el estado de reintentos */
    resetRetryState: () => void;
}

// =====================================================
// HOOK
// =====================================================

/**
 * Hook para ejecutar operaciones con reintentos automáticos
 * 
 * @example
 * ```tsx
 * const { executeWithRetry, retryState } = useRetry<SaleResult>({
 *   maxAttempts: 3,
 *   onRetryStart: (attempt) => toast.info(`Reintentando... (${attempt}/3)`),
 *   onRecovery: () => toast.success('Operación completada'),
 *   onExhausted: () => toast.error('No se pudo completar'),
 * });
 * 
 * const handleSale = async () => {
 *   const result = await executeWithRetry(() => createSaleSecure(data));
 *   if (result.success) {
 *     // ...
 *   }
 * };
 * 
 * // En el JSX:
 * {retryState.isRetrying && (
 *   <div className="flex items-center gap-2">
 *     <Spinner />
 *     <span>Reintentando... ({retryState.currentAttempt}/3)</span>
 *   </div>
 * )}
 * ```
 */
export function useRetry<T extends { success: boolean; error?: string }>(
    options: UseRetryOptions = {}
): UseRetryReturn<T> {
    const {
        maxAttempts = 3,
        baseDelay = 200,
        backoffFactor = 2,
        maxDelay = 5000,
        jitter = true,
        onRetryStart,
        onRecovery,
        onExhausted,
    } = options;

    const [retryState, setRetryState] = useState<UseRetryState>({
        isRetrying: false,
        currentAttempt: 0,
        totalAttempts: 0,
        lastRetryError: null,
        recoveredFromRetry: false,
    });

    // Ref para evitar actualizaciones en componentes desmontados
    const mountedRef = useRef(true);

    // Reset state
    const resetRetryState = useCallback(() => {
        if (mountedRef.current) {
            setRetryState({
                isRetrying: false,
                currentAttempt: 0,
                totalAttempts: 0,
                lastRetryError: null,
                recoveredFromRetry: false,
            });
        }
    }, []);

    // Ejecutar con reintentos
    const executeWithRetry = useCallback(async (
        operation: () => Promise<T>
    ): Promise<T> => {
        // Reset state al inicio
        setRetryState({
            isRetrying: false,
            currentAttempt: 1,
            totalAttempts: 0,
            lastRetryError: null,
            recoveredFromRetry: false,
        });

        let hadRetries = false;

        const result = await withServerActionRetry(operation, {
            maxAttempts,
            baseDelay,
            backoffFactor,
            maxDelay,
            jitter,
            onRetry: (attempt, error, delay) => {
                hadRetries = true;
                const errorMsg = typeof error === 'string' 
                    ? error 
                    : error instanceof Error 
                        ? error.message 
                        : 'Error desconocido';

                if (mountedRef.current) {
                    setRetryState(prev => ({
                        ...prev,
                        isRetrying: true,
                        currentAttempt: attempt + 1,
                        lastRetryError: errorMsg,
                    }));
                }

                onRetryStart?.(attempt + 1, errorMsg);
            },
        }) as T & { _retryInfo?: { attempts: number; totalTime: number } };

        // Actualizar estado final
        const finalAttempts = (result as any)._retryInfo?.attempts || 1;
        
        if (mountedRef.current) {
            setRetryState({
                isRetrying: false,
                currentAttempt: finalAttempts,
                totalAttempts: finalAttempts,
                lastRetryError: result.success ? null : (result.error || null),
                recoveredFromRetry: result.success && hadRetries,
            });
        }

        // Callbacks de resultado
        if (result.success && hadRetries) {
            onRecovery?.(finalAttempts);
        } else if (!result.success && finalAttempts >= maxAttempts) {
            onExhausted?.(finalAttempts, result.error || 'Error desconocido');
        }

        // Limpiar _retryInfo antes de retornar
        const cleanResult = { ...result };
        delete (cleanResult as any)._retryInfo;
        
        return cleanResult as T;
    }, [maxAttempts, baseDelay, backoffFactor, maxDelay, jitter, onRetryStart, onRecovery, onExhausted]);

    return {
        executeWithRetry,
        retryState,
        resetRetryState,
    };
}

// =====================================================
// COMPONENTE DE UI PARA ESTADO DE RETRY
// =====================================================

export interface RetryStatusProps {
    state: UseRetryState;
    maxAttempts: number;
    /** Texto personalizado durante reintentos */
    retryingText?: string;
    /** Texto cuando se recuperó */
    recoveredText?: string;
    /** Clases CSS adicionales */
    className?: string;
}

/**
 * Componente para mostrar el estado de reintentos
 * Usar con el hook useRetry
 * 
 * @example
 * <RetryStatus 
 *   state={retryState} 
 *   maxAttempts={3}
 *   retryingText="Procesando venta..."
 * />
 */
export function getRetryStatusMessage(
    state: UseRetryState,
    maxAttempts: number
): { message: string; type: 'retrying' | 'recovered' | 'idle' } {
    if (state.isRetrying) {
        return {
            message: `Reintentando... (${state.currentAttempt}/${maxAttempts})`,
            type: 'retrying',
        };
    }
    
    if (state.recoveredFromRetry) {
        return {
            message: `Completado después de ${state.totalAttempts} intentos`,
            type: 'recovered',
        };
    }
    
    return { message: '', type: 'idle' };
}

export default useRetry;
