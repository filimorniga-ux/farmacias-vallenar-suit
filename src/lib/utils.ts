import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
  }).format(amount);
}

export function formatRut(rut: string): string {
  if (!rut) return '';
  const cleanRut = rut.replace(/[^0-9kK]/g, '');
  if (cleanRut.length < 2) return cleanRut;
  const body = cleanRut.slice(0, -1);
  const dv = cleanRut.slice(-1).toUpperCase();
  return `${parseInt(body).toLocaleString('es-CL')}-${dv}`;
}

/**
 * Retry a function with exponential backoff
 * Useful for handling transient errors like PostgreSQL lock contention (55P03)
 * 
 * @param fn - Async function to retry
 * @param options - Retry options (maxRetries, baseDelayMs, retryableCodes)
 * @returns Result of fn or throws after max retries
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    retryableCodes?: string[];
    onRetry?: (attempt: number, error: any) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 100,
    retryableCodes = ['55P03', '40001'], // Lock contention & Serialization failure
    onRetry = () => { }
  } = options;

  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      const isRetryable = retryableCodes.includes(error?.code);
      const hasRetriesLeft = attempt < maxRetries;

      if (isRetryable && hasRetriesLeft) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1); // 100, 200, 400...
        onRetry(attempt, error);
        console.warn(`[Retry] Attempt ${attempt}/${maxRetries} failed with ${error.code}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }

  throw lastError;
}

