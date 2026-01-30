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

// --- DATE & TIME UTILS (CHILE TIMEZONE) ---

/**
 * Get current date in Chile Timezone
 */
export function getChileDate(): Date {
  const now = new Date();
  const chileTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Santiago" }));
  return chileTime;
}

/**
 * Format date to Chile local string
 */
export function formatChileDate(date: Date | string, options: Intl.DateTimeFormatOptions = {}): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;

  return d.toLocaleString('es-CL', {
    timeZone: 'America/Santiago',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options
  });
}

/**
 * Get current ISO string with Chile offset (approximate)
 * Use this for DB timestamps if you want to force local time representation
 */
export function getChileISOString(): string {
  const d = getChileDate();
  return d.toISOString();
}

/**
 * Retry a function with exponential backoff
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
    retryableCodes = ['55P03', '40001'],
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
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
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
