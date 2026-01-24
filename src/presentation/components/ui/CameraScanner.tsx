
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Camera, RefreshCw } from 'lucide-react';

interface CameraScannerProps {
    onScan: (code: string) => void;
    onClose: () => void;
}

export function CameraScanner({ onScan, onClose }: CameraScannerProps) {
    const [error, setError] = useState<string | null>(null);
    const scannerRef = useRef<Html5Qrcode | null>(null);

    useEffect(() => {
        const startScanner = async () => {
            // 1. Check permissions logic handled by library mostly, but we trigger it.
            try {
                const devices = await Html5Qrcode.getCameras();
                if (devices && devices.length) {
                    const cameraId = devices[0].id; // Use first camera (usually back on mobile if preferred)

                    // Prefer environment camera (back)
                    const config = {
                        fps: 10,
                        qrbox: { width: 250, height: 250 },
                        aspectRatio: 1.0
                    };

                    const html5QrCode = new Html5Qrcode("reader");
                    scannerRef.current = html5QrCode;

                    await html5QrCode.start(
                        { facingMode: "environment" },
                        config,
                        (decodedText) => {
                            // Success
                            console.log(`Scan success: ${decodedText}`);
                            // Simple beep logic could go here
                            onScan(decodedText);
                            stopScanner();
                        },
                        (errorMessage) => {
                            // Ignore parse errors, they flood console
                        }
                    );
                } else {
                    setError("No se encontraron cámaras.");
                }
            } catch (err: any) {
                console.error("Error starting scanner", err);
                setError("Error al acceder a la cámara. Verifique permisos.");
            }
        };

        const stopScanner = async () => {
            if (scannerRef.current) {
                try {
                    await scannerRef.current.stop();
                    scannerRef.current.clear();
                    scannerRef.current = null;
                } catch (e) {
                    // ignore
                }
            }
        };

        // Delay start slightly to ensure DOM is ready
        const timer = setTimeout(startScanner, 100);

        return () => {
            clearTimeout(timer);
            stopScanner();
        };
    }, []);

    return (
        <div className="fixed inset-0 z-[10000] bg-black text-white flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-black rounded-3xl overflow-hidden relative border border-slate-700">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-20 bg-slate-800/80 p-2 rounded-full text-white hover:bg-slate-700"
                >
                    <X size={24} />
                </button>

                <div className="p-4 text-center">
                    <h3 className="text-xl font-bold mb-1">Escaneando...</h3>
                    <p className="text-slate-400 text-sm">Apunte la cámara al código de barras</p>
                </div>

                <div id="reader" className="w-full bg-black min-h-[300px]" />

                {error && (
                    <div className="p-4 text-red-400 text-center font-bold">
                        {error}
                    </div>
                )}

                <div className="p-6 text-center text-xs text-slate-500">
                    Si no funciona, intente mejor iluminación o ingrese el código manual.
                </div>
            </div>
        </div>
    );
}

export default CameraScanner;
