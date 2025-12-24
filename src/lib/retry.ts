/**
 * 🔄 RETRY UTILITIES
 * Pharma-Synapse v3.1 - Farmacias Vallenar
 * 
 * Utilidades para reintentos automáticos en operaciones
 * que pueden fallar por conflictos de concurrencia.
 * 
 * Casos de uso:
 * - Errores SERIALIZATION_FAILURE (40001)
 * - Errores DEADLOCK_DETECTED (40P01)
 * - Errores LOCK_NOT_AVAILABLE (55P03)
 * - Timeouts de red temporales
 * 
 * @version 1.0.0
 * @date 2024-12-24
 */

// =====================================================
// TIPOS
// =====================================================

export interface RetryOptions {
    /** Número máximo de intentos (default: 3) */
    maxAttempts?: number;
    /** Delay base en ms entre intentos (default: 200) */
    baseDelay?: number;
    /** Factor de multiplicación para backoff exponencial (default: 2) */
    backoffFactor?: number;
    /** Delay máximo en ms (default: 5000) */
    maxDelay?: number;
    /** Función para determinar si el error es retriable */
    isRetriable?: (error: unknown) => boolean;
    /** Callback antes de cada reintento */
    onRetry?: (attempt: number, error: unknown, nextDelay: number) => void;
    /** Añadir jitter aleatorio al delay (default: true) */
    jitter?: boolean;
}

export interface RetryResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    attempts: number;
    totalTime: number;
    /** Si falló, indica si fue porque se agotaron los reintentos */
    exhausted?: boolean;
}

// =====================================================
// CÓDIGOS DE ERROR RETRIABLES
// =====================================================

/** Códigos PostgreSQL que indican conflictos de concurrencia */
export const RETRIABLE_PG_CODES = [
    '40001', // serialization_failure
    '40P01', // deadlock_detected
    '55P03', // lock_not_available
    '57014', // query_canceled (timeout)
    '08000', // connection_exception
    '08003', // connection_does_not_exist
    '08006', // connection_failure
] as const;

/** Mensajes de error que indican problemas de red */
export const RETRIABLE_NETWORK_PATTERNS = [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNREFUSED',
    'fetch failed',
    'network error',
    'timeout',
] as const;

// =====================================================
// FUNCIONES DE UTILIDAD
// =====================================================

/**
 * Determina si un error es retriable basándose en código PG o patrón de red
 */
export function isRetriableError(error: unknown): boolean {
    if (!error) return false;
    
    // Verificar código de error PostgreSQL
    if (typeof error === 'object' && error !== null) {
        const pgCode = (error as any).code;
        if (pgCode && RETRIABLE_PG_CODES.includes(pgCode)) {
            return true;
        }
    }
    
    // Verificar mensaje de error para patrones de red
    const errorMessage = error instanceof Error 
        ? error.message 
        : typeof error === 'string' 
            ? error 
            : JSON.stringify(error);
    
    const lowerMessage = errorMessage.toLowerCase();
    
    return RETRIABLE_NETWORK_PATTERNS.some(pattern => 
        lowerMessage.includes(pattern.toLowerCase())
    );
}

/**
 * Calcula el delay para el siguiente intento con backoff exponencial
 */
export function calculateDelay(
    attempt: number,
    baseDelay: number,
    backoffFactor: number,
    maxDelay: number,
    jitter: boolean
): number {
    // Backoff exponencial: baseDelay * (factor ^ attempt)
    let delay = baseDelay * Math.pow(backoffFactor, attempt - 1);
    
    // Aplicar límite máximo
    delay = Math.min(delay, maxDelay);
    
    // Añadir jitter aleatorio (±25%)
    if (jitter) {
        const jitterAmount = delay * 0.25;
        delay = delay + (Math.random() * jitterAmount * 2 - jitterAmount);
    }
    
    return Math.round(delay);
}

/**
 * Espera un número de milisegundos
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// =====================================================
// FUNCIÓN PRINCIPAL DE RETRY
// =====================================================

/**
 * Ejecuta una función con reintentos automáticos para errores de concurrencia
 * 
 * @example
 * const result = await withRetry(
 *   () => createSaleSecure(saleData),
 *   { 
 *     maxAttempts: 3,
 *     onRetry: (attempt, error) => console.log(`Retry ${attempt}:`, error)
 *   }
 * );
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
): Promise<RetryResult<T>> {
    const {
        maxAttempts = 3,
        baseDelay = 200,
        backoffFactor = 2,
        maxDelay = 5000,
        isRetriable = isRetriableError,
        onRetry,
        jitter = true,
    } = options;
    
    const startTime = Date.now();
    let lastError: unknown;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const data = await operation();
            return {
                success: true,
                data,
                attempts: attempt,
                totalTime: Date.now() - startTime,
            };
        } catch (error) {
            lastError = error;
            
            // Verificar si debemos reintentar
            if (attempt < maxAttempts && isRetriable(error)) {
                const delay = calculateDelay(
                    attempt, 
                    baseDelay, 
                    backoffFactor, 
                    maxDelay,
                    jitter
                );
                
                // Callback de reintento
                if (onRetry) {
                    onRetry(attempt, error, delay);
                }
                
                await sleep(delay);
                continue;
            }
            
            // No es retriable o se agotaron los intentos
            break;
        }
    }
    
    // Falló después de todos los intentos
    const errorMessage = lastError instanceof Error 
        ? lastError.message 
        : String(lastError);
    
    return {
        success: false,
        error: errorMessage,
        attempts: maxAttempts,
        totalTime: Date.now() - startTime,
        exhausted: true,
    };
}

// =====================================================
// WRAPPER PARA SERVER ACTIONS
// =====================================================

/**
 * Tipo para resultados de server actions estándar
 */
interface ServerActionResult<T = unknown> {
    success: boolean;
    error?: string;
    data?: T;
    [key: string]: unknown;
}

/**
 * Ejecuta un server action con reintentos para errores de concurrencia
 * 
 * Esta versión está diseñada específicamente para server actions
 * que devuelven { success, error, data }
 * 
 * @example
 * const result = await withServerActionRetry(
 *   () => createSaleSecure(saleData),
 *   { maxAttempts: 3 }
 * );
 */
export async function withServerActionRetry<T extends ServerActionResult>(
    action: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T & { _retryInfo?: { attempts: number; totalTime: number } }> {
    const {
        maxAttempts = 3,
        baseDelay = 200,
        backoffFactor = 2,
        maxDelay = 5000,
        onRetry,
        jitter = true,
    } = options;
    
    const startTime = Date.now();
    let lastResult: T | null = null;
    
    // Errores específicos de nuestros server actions que son retriables
    const isServerActionRetriable = (result: T): boolean => {
        if (result.success) return false;
        
        const error = result.error?.toLowerCase() || '';
        return (
            error.includes('concurrencia') ||
            error.includes('bloqueado') ||
            error.includes('serialization') ||
            error.includes('deadlock') ||
            error.includes('lock') ||
            error.includes('timeout') ||
            error.includes('retry')
        );
    };
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const result = await action();
            lastResult = result;
            
            // Si fue exitoso, retornar con info de retry
            if (result.success) {
                return {
                    ...result,
                    _retryInfo: {
                        attempts: attempt,
                        totalTime: Date.now() - startTime,
                    },
                };
            }
            
            // Si falló pero no es retriable, retornar inmediatamente
            if (!isServerActionRetriable(result)) {
                return result;
            }
            
            // Es retriable y hay más intentos disponibles
            if (attempt < maxAttempts) {
                const delay = calculateDelay(
                    attempt,
                    baseDelay,
                    backoffFactor,
                    maxDelay,
                    jitter
                );
                
                if (onRetry) {
                    onRetry(attempt, result.error, delay);
                }
                
                await sleep(delay);
            }
        } catch (error) {
            // Error de red u otro error no manejado
            if (attempt < maxAttempts && isRetriableError(error)) {
                const delay = calculateDelay(
                    attempt,
                    baseDelay,
                    backoffFactor,
                    maxDelay,
                    jitter
                );
                
                if (onRetry) {
                    onRetry(attempt, error, delay);
                }
                
                await sleep(delay);
                continue;
            }
            
            // No retriable o último intento
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Error de conexión',
            } as T;
        }
    }
    
    // Retornar último resultado con info de reintentos agotados
    return lastResult || { 
        success: false, 
        error: 'Error después de múltiples intentos' 
    } as T;
}

// =====================================================
// HOOK DE REACT PARA RETRY
// =====================================================

/**
 * Estado del hook useRetry
 */
export interface UseRetryState {
    isRetrying: boolean;
    currentAttempt: number;
    lastError: string | null;
}

/**
 * Crea un callback con estado de reintentos para usar en componentes React
 * 
 * @example
 * const { execute, isRetrying, currentAttempt } = useRetryCallback(
 *   async () => await processSale(data),
 *   { maxAttempts: 3, onRetry: (a) => toast.info(`Reintentando... ${a}`) }
 * );
 * 
 * // En el handler:
 * const result = await execute();
 */
export function createRetryCallback<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
): {
    execute: () => Promise<RetryResult<T>>;
    getState: () => UseRetryState;
} {
    let state: UseRetryState = {
        isRetrying: false,
        currentAttempt: 0,
        lastError: null,
    };
    
    const execute = async (): Promise<RetryResult<T>> => {
        state = { isRetrying: true, currentAttempt: 1, lastError: null };
        
        const result = await withRetry(operation, {
            ...options,
            onRetry: (attempt, error, delay) => {
                state = {
                    isRetrying: true,
                    currentAttempt: attempt + 1,
                    lastError: error instanceof Error ? error.message : String(error),
                };
                options.onRetry?.(attempt, error, delay);
            },
        });
        
        state = {
            isRetrying: false,
            currentAttempt: result.attempts,
            lastError: result.error || null,
        };
        
        return result;
    };
    
    return {
        execute,
        getState: () => state,
    };
}
