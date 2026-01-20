
import { useState, useCallback } from 'react';
import { getProductsSecure } from '@/actions/get-products-v2';

export interface ScannedProduct {
    name: string;
    image?: string;
    source: 'INTERNAL' | 'OPEN_FOOD_FACTS';
    found: boolean;
    raw?: any;
}

export const useScannerLogic = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [scannedProduct, setScannedProduct] = useState<ScannedProduct | null>(null);
    const [showModal, setShowModal] = useState(false);

    const playSound = (success: boolean) => {
        try {
            // Simple oscillator beep for now, or load file if available
            // User mentioned "Bip" or vibration
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(success ? 200 : [100, 50, 100]);
            }

            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContext) {
                const ctx = new AudioContext();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = success ? 'sine' : 'square';
                osc.frequency.value = success ? 1000 : 400;
                gain.gain.value = 0.1;
                osc.start();
                setTimeout(() => osc.stop(), 200);
            }
        } catch (e) {
            console.error("Audio feedback failed", e);
        }
    };

    const processScan = useCallback(async (code: string) => {
        setIsLoading(true);
        try {
            // 1. Search Internal DB
            // We pass 'undefined' for locationId to let server resolve from headers or default
            const internalRes = await getProductsSecure(code, '');

            if (internalRes.success && internalRes.data && internalRes.data.length > 0) {
                const product = internalRes.data[0];
                setScannedProduct({
                    name: product.name,
                    source: 'INTERNAL',
                    found: true,
                    raw: product
                });
                playSound(true);
                setShowModal(true);
                return;
            }

            // 2. Search Open Food Facts
            const offRes = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
            const offData = await offRes.json();

            if (offData.status === 1) { // Found
                setScannedProduct({
                    name: offData.product.product_name || "Producto sin nombre",
                    image: offData.product.image_front_small_url || offData.product.image_url,
                    source: 'OPEN_FOOD_FACTS',
                    found: true,
                    raw: offData.product
                });
                playSound(true);
                setShowModal(true);
            } else {
                // Not Found Anywhere
                setScannedProduct({
                    name: "Producto desconocido",
                    source: 'OPEN_FOOD_FACTS',
                    found: false,
                    raw: { code }
                });
                playSound(false);
                setShowModal(true);
            }

        } catch (error) {
            console.error("Scan processing error", error);
            setScannedProduct(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const resetScan = () => {
        setScannedProduct(null);
        setShowModal(false);
    };

    return {
        isLoading,
        scannedProduct,
        showModal,
        processScan,
        resetScan
    };
};
