
'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera } from 'lucide-react';

interface CameraScannerProps {
    onScan: (code: string) => void;
    onClose: () => void;
    continuous?: boolean;
    scanCount?: number;
}

// Audio beep using Web Audio API
function playBeep(success: boolean = true) {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = success ? 880 : 440;
        gain.gain.value = 0.3;
        osc.start();
        osc.stop(ctx.currentTime + (success ? 0.12 : 0.3));
    } catch {
        // Audio not available
    }
}

export function CameraScanner({ onScan, onClose, continuous = false, scanCount = 0 }: CameraScannerProps) {
    const [error, setError] = useState<string | null>(null);
    const [lastScanned, setLastScanned] = useState<string | null>(null);
    const [flashColor, setFlashColor] = useState<string | null>(null);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const cooldownRef = useRef(false);
    const mountedRef = useRef(true);

    const handleScanResult = useCallback((decodedText: string) => {
        if (cooldownRef.current) return;

        cooldownRef.current = true;
        playBeep(true);
        setLastScanned(decodedText);
        setFlashColor('bg-emerald-500/30');
        onScan(decodedText);

        setTimeout(() => {
            if (mountedRef.current) {
                setFlashColor(null);
                setLastScanned(null);
            }
            cooldownRef.current = false;
        }, 1500);

        if (!continuous) {
            // Stop after single scan
            if (scannerRef.current) {
                scannerRef.current.stop().catch(() => { });
            }
        }
    }, [onScan, continuous]);

    useEffect(() => {
        mountedRef.current = true;

        const startScanner = async () => {
            try {
                const devices = await Html5Qrcode.getCameras();
                if (devices && devices.length) {
                    const config = {
                        fps: 10,
                        qrbox: { width: 250, height: 100 },
                        aspectRatio: 1.0
                    };

                    const html5QrCode = new Html5Qrcode("reader");
                    scannerRef.current = html5QrCode;

                    await html5QrCode.start(
                        { facingMode: "environment" },
                        config,
                        (decodedText) => {
                            handleScanResult(decodedText);
                        },
                        () => {
                            // Ignore parse errors
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

        const timer = setTimeout(startScanner, 100);

        return () => {
            mountedRef.current = false;
            clearTimeout(timer);
            if (scannerRef.current) {
                scannerRef.current.stop().then(() => {
                    scannerRef.current?.clear();
                    scannerRef.current = null;
                }).catch(() => { });
            }
        };
    }, [handleScanResult]);

    return (
        <div className="fixed inset-0 z-[10000] bg-black text-white flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-black rounded-3xl overflow-hidden relative border border-slate-700">

                {/* Flash overlay */}
                {flashColor && (
                    <div className={`absolute inset-0 z-30 ${flashColor} transition-opacity duration-300 pointer-events-none rounded-3xl`} />
                )}

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-20 bg-slate-800/80 p-2 rounded-full text-white hover:bg-slate-700"
                >
                    <X size={24} />
                </button>

                <div className="p-4 text-center">
                    <h3 className="text-xl font-bold mb-1">
                        {continuous ? '📦 Escaneo Continuo' : 'Escaneando...'}
                    </h3>
                    <p className="text-slate-400 text-sm">
                        {continuous
                            ? `Escanee cada producto · ${scanCount} escaneados`
                            : 'Apunte la cámara al código de barras'}
                    </p>
                </div>

                <div id="reader" className="w-full bg-black min-h-[300px]" />

                {lastScanned && (
                    <div className="p-3 text-center animate-in fade-in duration-200">
                        <span className="inline-flex items-center gap-2 bg-emerald-900/50 text-emerald-400 px-3 py-1.5 rounded-full text-sm font-bold">
                            ✅ {lastScanned}
                        </span>
                    </div>
                )}

                {error && (
                    <div className="p-4 text-red-400 text-center font-bold">
                        {error}
                    </div>
                )}

                <div className="p-4 text-center text-xs text-slate-500">
                    {continuous
                        ? 'Escanee productos uno a uno. Espere el beep antes del siguiente.'
                        : 'Si no funciona, intente mejor iluminación o ingrese el código manual.'}
                </div>
            </div>
        </div>
    );
}

export default CameraScanner;

