import { useEffect, useCallback, useRef } from 'react';

interface UseBarcodeScannerProps {
    onScan: (barcode: string) => void;
    minLength?: number;
    latency?: number;
    targetInputRef?: React.RefObject<HTMLInputElement | null>; // Optional: if provided, only listens to this input
}

export const useBarcodeScanner = ({ onScan, minLength = 3, latency = 50, targetInputRef }: UseBarcodeScannerProps) => {
    // We use a ref to keep track of the buffer to avoid dependency issues in the effect
    const bufferRef = useRef('');
    const lastKeyTimeRef = useRef(Date.now());

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

            // If a specific input ref is provided, ONLY listen to that input
            if (targetInputRef) {
                if (target !== targetInputRef.current) return;
            } else {
                // Global mode: Ignore inputs to prevent interfering with normal typing
                if (isInput) return;
            }

            const currentTime = Date.now();

            // Reset buffer if latency exceeded (manual typing vs scanner speed)
            if (currentTime - lastKeyTimeRef.current > latency) {
                bufferRef.current = '';
            }

            if (e.key === 'Enter') {
                // If buffer has enough length, trigger scan
                if (bufferRef.current.length >= minLength) {
                    e.preventDefault(); // Prevent form submission or newline
                    onScan(bufferRef.current);
                    bufferRef.current = '';
                }
            } else if (e.key.length === 1) {
                // Accumulate characters
                bufferRef.current += e.key;
            }

            lastKeyTimeRef.current = currentTime;
        };

        // If targetInputRef is provided, we attach to the element (if possible) or window but filter by target
        // Since React refs might not be ready immediately or we want to capture bubbling, window listener is often safer for scanners
        // acting as keyboards, but we check e.target.
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onScan, minLength, latency, targetInputRef]);
};
