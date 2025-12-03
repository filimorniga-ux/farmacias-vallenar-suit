import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Camera, SwitchCamera, Zap, ZapOff } from 'lucide-react';
import { toast } from 'sonner';

interface CameraScannerProps {
    onScan: (decodedText: string) => void;
    onClose: () => void;
}

const CameraScanner: React.FC<CameraScannerProps> = ({ onScan, onClose }) => {
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
    const [torchEnabled, setTorchEnabled] = useState(false);

    useEffect(() => {
        const startScanner = async () => {
            try {
                const devices = await Html5Qrcode.getCameras();
                if (devices && devices.length) {
                    const cameraId = devices[0].id;

                    const html5QrCode = new Html5Qrcode("reader", {
                        formatsToSupport: [
                            Html5QrcodeSupportedFormats.QR_CODE,
                            Html5QrcodeSupportedFormats.EAN_13,
                            Html5QrcodeSupportedFormats.EAN_8,
                            Html5QrcodeSupportedFormats.CODE_128,
                            Html5QrcodeSupportedFormats.CODE_39,
                            Html5QrcodeSupportedFormats.UPC_A,
                            Html5QrcodeSupportedFormats.UPC_E,
                            Html5QrcodeSupportedFormats.ITF
                        ],
                        verbose: false
                    });
                    scannerRef.current = html5QrCode;

                    await html5QrCode.start(
                        { facingMode: facingMode },
                        {
                            fps: 10,
                            qrbox: { width: 250, height: 250 },
                            aspectRatio: 1.0
                        },
                        (decodedText) => {
                            // Success callback
                            onScan(decodedText);
                            stopScanner(); // Stop after first successful scan
                        },
                        (errorMessage) => {
                            // Error callback (ignore for scanning errors)
                        }
                    );
                    setIsScanning(true);
                } else {
                    setCameraError("No se encontraron cámaras.");
                }
            } catch (err) {
                console.error("Error starting scanner", err);
                setCameraError("Error al acceder a la cámara. Verifique los permisos.");
            }
        };

        startScanner();

        return () => {
            stopScanner();
        };
    }, [facingMode]);

    const stopScanner = async () => {
        if (scannerRef.current && scannerRef.current.isScanning) {
            try {
                await scannerRef.current.stop();
                scannerRef.current.clear();
                setIsScanning(false);
            } catch (err) {
                console.error("Failed to stop scanner", err);
            }
        }
    };

    const toggleCamera = () => {
        stopScanner().then(() => {
            setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
        });
    };

    // Note: Torch support is limited in browsers
    const toggleTorch = () => {
        // Implementation depends on advanced constraints, skipping for basic version
        toast.info("Función de linterna no disponible en este navegador");
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center p-4 bg-black/50 backdrop-blur-sm absolute top-0 left-0 right-0 z-10">
                <h2 className="text-white font-bold flex items-center gap-2">
                    <Camera className="text-cyan-400" /> Escáner
                </h2>
                <button onClick={onClose} className="text-white p-2 rounded-full hover:bg-white/20">
                    <X size={24} />
                </button>
            </div>

            {/* Scanner Viewport */}
            <div className="flex-1 relative flex items-center justify-center bg-black">
                <div id="reader" className="w-full h-full max-w-md mx-auto overflow-hidden rounded-lg"></div>

                {/* Overlay Guide */}
                {isScanning && !cameraError && (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                        <div className="w-64 h-64 border-2 border-red-500 rounded-lg relative opacity-70">
                            <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-red-500 -mt-1 -ml-1"></div>
                            <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-red-500 -mt-1 -mr-1"></div>
                            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-red-500 -mb-1 -ml-1"></div>
                            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-red-500 -mb-1 -mr-1"></div>
                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-red-500 font-bold text-sm bg-black/50 px-2 py-1 rounded">
                                APUNTA AQUÍ
                            </div>
                        </div>
                    </div>
                )}

                {/* Error Message */}
                {cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900 text-white p-6 text-center">
                        <div>
                            <Camera size={48} className="mx-auto mb-4 text-slate-600" />
                            <p className="text-lg font-bold mb-2">Cámara no disponible</p>
                            <p className="text-slate-400 text-sm">{cameraError}</p>
                            <button onClick={onClose} className="mt-6 px-6 py-2 bg-slate-700 rounded-full font-bold">
                                Cerrar
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="p-6 bg-black/80 backdrop-blur-sm flex justify-center gap-8 pb-10">
                <button onClick={toggleCamera} className="flex flex-col items-center gap-1 text-white opacity-80 hover:opacity-100">
                    <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                        <SwitchCamera size={24} />
                    </div>
                    <span className="text-xs">Rotar</span>
                </button>

                {/* Torch button placeholder */}
                <button onClick={toggleTorch} className="flex flex-col items-center gap-1 text-white opacity-50 hover:opacity-100">
                    <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                        {torchEnabled ? <ZapOff size={24} /> : <Zap size={24} />}
                    </div>
                    <span className="text-xs">Luz</span>
                </button>
            </div>
        </div>
    );
};

export default CameraScanner;
