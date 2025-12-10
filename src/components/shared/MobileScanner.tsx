
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { useEffect, useRef, useState } from 'react';

interface MobileScannerProps {
    onScan: (code: string) => void;
    onClose: () => void;
    continuous?: boolean;
}

export function MobileScanner({ onScan, onClose, continuous = false }: MobileScannerProps) {
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const regionId = "mobile-scanner-region";

    useEffect(() => {
        // Initialize Scanner
        if (!scannerRef.current) {
            const scanner = new Html5QrcodeScanner(
                regionId,
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1.0,
                    formatsToSupport: [
                        Html5QrcodeSupportedFormats.EAN_13,
                        Html5QrcodeSupportedFormats.CODE_128,
                        Html5QrcodeSupportedFormats.QR_CODE
                    ]
                },
                /* verbose= */ false
            );

            scanner.render(
                (decodedText) => {
                    // Success Callback
                    if (navigator.vibrate) navigator.vibrate(200); // Haptic

                    // Audio Beep
                    const audio = new Audio('/beep.mp3'); // We'll need a beep.mp3 or internal synth
                    audio.play().catch(() => { }); // Ignore auto-play errors

                    onScan(decodedText);

                    if (!continuous) {
                        scanner.clear();
                        onClose();
                    }
                },
                (errorMessage) => {
                    // console.warn(errorMessage); // Ignore parse errors
                }
            );

            scannerRef.current = scanner;
            setIsScanning(true);
        }

        return () => {
            if (scannerRef.current) {
                scannerRef.current.clear().catch(console.error);
            }
        };
    }, [onScan, onClose, continuous]);

    return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white rounded-lg overflow-hidden relative">
                <button
                    onClick={onClose}
                    className="absolute top-2 right-2 z-10 bg-gray-800 text-white rounded-full p-2"
                >
                    ✖
                </button>
                <div id={regionId} className="w-full h-auto min-h-[300px] bg-gray-100"></div>
                <div className="p-4 text-center">
                    <p className="text-sm text-gray-600">Apunta la cámara al código de barras</p>
                </div>
            </div>
        </div>
    );
}
