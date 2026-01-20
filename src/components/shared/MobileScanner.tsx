
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { useEffect, useRef, useState } from 'react';
import { useScannerLogic } from '@/hooks/useScannerLogic';
import { useRouter } from 'next/navigation';

interface MobileScannerProps {
    onClose: () => void;
    onScan?: (code: string) => void;
    continuous?: boolean;
}

export function MobileScanner({ onClose, onScan, continuous }: MobileScannerProps) {
    const regionId = "mobile-scanner-region";
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const lastScanRef = useRef<{ code: string, time: number } | null>(null);
    const [isMounted, setIsMounted] = useState(false);
    const { processScan, scannedProduct, showModal, resetScan, isLoading } = useScannerLogic();
    const router = useRouter();

    // iOS Detection
    const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);

    useEffect(() => {
        setIsMounted(true);
        return () => setIsMounted(false);
    }, []);

    useEffect(() => {
        if (!isMounted) return;

        const startScanner = async () => {
            try {
                const scanner = new Html5Qrcode(regionId);
                scannerRef.current = scanner;

                const config = {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1.0
                };

                // iOS-Specific Constraints
                const videoConstraints = isIOS
                    ? { width: 1280, height: 720, facingMode: "environment" } // HD for better macro/zoom
                    : { facingMode: "environment" };

                await scanner.start(
                    { facingMode: "environment" },
                    { ...config, videoConstraints },
                    (decodedText) => {
                        // Throttling for continuous mode
                        if (continuous) {
                            const now = Date.now();
                            if (lastScanRef.current &&
                                lastScanRef.current.code === decodedText &&
                                (now - lastScanRef.current.time < 2000)) {
                                return; // Skip duplicate scan within 2s
                            }
                            lastScanRef.current = { code: decodedText, time: now };
                        } else {
                            scanner.pause();
                        }

                        if (onScan) {
                            onScan(decodedText);
                        } else {
                            processScan(decodedText);
                        }
                    },
                    (errorMessage) => {
                        // ignore
                    }
                );
            } catch (err) {
                console.error("Scanner failed", err);
            }
        };

        const timeout = setTimeout(startScanner, 100);

        return () => {
            clearTimeout(timeout);
            if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.stop().then(() => scannerRef.current?.clear()).catch(console.error);
            }
        };
    }, [isMounted, isIOS, processScan]);

    // Restart scanner when modal closes
    const handleCloseModal = () => {
        resetScan();
        if (scannerRef.current) {
            scannerRef.current.resume();
        }
    };

    const handleCreateProduct = () => {
        // Navigate to create product page with pre-filled barcode
        // Assuming we have the raw code in scannedProduct?.raw?.code or similar
        // For 'Not Found', we saved { code } in raw
        const code = scannedProduct?.raw?.code || scannedProduct?.raw?._id || "";
        router.push(`/inventario?action=create&barcode=${code}`);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-0">
            {/* Close Button */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 z-20 bg-gray-900/50 text-white rounded-full p-3 backdrop-blur-md"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>

            {/* Scanner Area */}
            <div className="w-full h-full relative overflow-hidden bg-black flex items-center justify-center">
                <div
                    id={regionId}
                    className="w-full h-full object-cover"
                    style={{
                        transform: isIOS ? 'scale(1.5)' : 'none', // Digital Zoom trick
                        transformOrigin: 'center center'
                    }}
                ></div>

                {/* Visual Feedback Overlay */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className={`w-64 h-64 border-4 rounded-lg transition-colors duration-200 ${isLoading ? 'border-yellow-400 animate-pulse' : 'border-white/50'
                        }`}>
                        <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-white -mt-1 -ml-1"></div>
                        <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-white -mt-1 -mr-1"></div>
                        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-white -mb-1 -ml-1"></div>
                        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-white -mb-1 -mr-1"></div>
                    </div>
                </div>

                <div className="absolute bottom-10 left-0 right-0 text-center text-white/80 p-4">
                    <p className="text-sm font-medium mb-1">Apunta al código de barras</p>
                    {isIOS && <span className="text-xs bg-white/20 px-2 py-1 rounded">Modo Macro iOS Activado 📸</span>}
                </div>
            </div>

            {/* Result Modal */}
            {showModal && scannedProduct && (
                <div className="absolute inset-0 z-30 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className={`w-full max-w-sm rounded-xl overflow-hidden shadow-2xl ${scannedProduct.found ? 'bg-white' : 'bg-amber-50'
                        }`}>
                        {/* Header Color */}
                        <div className={`h-2 w-full ${scannedProduct.found
                            ? (scannedProduct.source === 'INTERNAL' ? 'bg-green-500' : 'bg-blue-500')
                            : 'bg-orange-500'
                            }`}></div>

                        <div className="p-6 text-center">
                            {/* Icon/Image */}
                            {scannedProduct.found && scannedProduct.image ? (
                                <img src={scannedProduct.image} alt={scannedProduct.name} className="w-24 h-24 mx-auto mb-4 object-contain rounded-md border" />
                            ) : (
                                <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${scannedProduct.found ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'
                                    }`}>
                                    {scannedProduct.found ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                    )}
                                </div>
                            )}

                            <h3 className="text-xl font-bold text-gray-900 mb-1">{scannedProduct.name}</h3>
                            <p className="text-sm text-gray-500 mb-6">
                                {scannedProduct.found
                                    ? (scannedProduct.source === 'INTERNAL' ? '✅ Encontrado en sistema' : '🌍 Encontrado en OpenFoodFacts')
                                    : '⚠️ Producto desconocido'}
                            </p>

                            <div className="flex gap-3">
                                <button
                                    onClick={handleCloseModal}
                                    className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium transition-colors"
                                >
                                    Escanear otro
                                </button>

                                {!scannedProduct.found && (
                                    <button
                                        onClick={handleCreateProduct}
                                        className="flex-1 py-3 px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-bold shadow-lg shadow-orange-500/30 transition-colors"
                                    >
                                        Crear
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
