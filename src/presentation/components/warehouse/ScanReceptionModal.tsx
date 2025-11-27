import React, { useState, useRef, useEffect } from 'react';
import { X, Barcode, Package, CheckCircle, AlertTriangle, Save, Volume2 } from 'lucide-react';
import { usePharmaStore } from '../../store/useStore';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { toast } from 'sonner';

interface ScanReceptionModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ScanReceptionModal: React.FC<ScanReceptionModalProps> = ({ isOpen, onClose }) => {
    const { inventory, suppliers } = usePharmaStore();
    const [scannedItems, setScannedItems] = useState<{ sku: string; name: string; quantity: number; cost: number }[]>([]);
    const [lastScanned, setLastScanned] = useState<string | null>(null);
    const [scanInput, setScanInput] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Sound effects (simulated with Audio API or just visual feedback for now)
    const playBeep = () => {
        // In a real app, we would play a sound here
        // const audio = new Audio('/beep.mp3');
        // audio.play();
    };

    const handleScan = (code: string) => {
        // Search in global inventory (or product master)
        // For this demo, we search in existing inventory to get product details
        // In a real scenario, we might search a "Product Catalog" separate from stock
        const product = inventory.find(i => i.sku === code || i.barcode === code || i.id === code);

        if (product) {
            setScannedItems(prev => {
                const existing = prev.find(i => i.sku === product.sku);
                if (existing) {
                    return prev.map(i => i.sku === product.sku ? { ...i, quantity: i.quantity + 1 } : i);
                } else {
                    return [...prev, { sku: product.sku, name: product.name, quantity: 1, cost: product.cost_price }];
                }
            });
            setLastScanned(product.name);
            playBeep();
            toast.success(`Leído: ${product.name}`);
        } else {
            toast.error(`Producto desconocido: ${code}`);
            // Optional: Prompt to create new product?
        }
    };

    useBarcodeScanner({
        onScan: handleScan,
        minLength: 3,
        targetInputRef: inputRef
    });

    const handleFinish = () => {
        if (scannedItems.length === 0) {
            onClose();
            return;
        }

        // Here we would typically open a "Review & Confirm" step or create a "Draft Reception"
        // For now, we just show a success message and close
        toast.success(`Recepción guardada con ${scannedItems.reduce((acc, i) => acc + i.quantity, 0)} unidades.`);
        onClose();
    };

    if (!isOpen) return null;

    const totalUnits = scannedItems.reduce((acc, i) => acc + i.quantity, 0);
    const totalLines = scannedItems.length;

    return (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md z-50 flex flex-col animate-in fade-in duration-200">
            {/* Header */}
            <div className="p-6 flex justify-between items-center border-b border-slate-700/50">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                        <Barcode className="text-cyan-400" size={32} />
                        Recepción Modo Escáner
                    </h2>
                    <p className="text-slate-400">Escaneo rápido de entrada</p>
                </div>
                <button onClick={onClose} className="p-3 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white">
                    <X size={32} />
                </button>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

                {/* Left: Scanner Area */}
                <div className="flex-1 p-8 flex flex-col items-center justify-center border-r border-slate-700/50 relative">

                    {/* Big Counter */}
                    <div className="text-center mb-12">
                        <div className="text-[120px] font-bold text-cyan-400 leading-none tabular-nums tracking-tighter drop-shadow-2xl">
                            {totalUnits}
                        </div>
                        <div className="text-2xl text-slate-500 font-medium uppercase tracking-widest mt-2">Unidades Totales</div>
                    </div>

                    {/* Input Field */}
                    <div className="w-full max-w-2xl relative group">
                        <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity duration-500"></div>
                        <input
                            ref={inputRef}
                            type="text"
                            value={scanInput}
                            onChange={(e) => setScanInput(e.target.value)}
                            className="w-full bg-slate-800 border-2 border-slate-600 focus:border-cyan-500 text-white text-3xl font-mono text-center py-6 rounded-2xl shadow-2xl outline-none transition-all placeholder:text-slate-600"
                            placeholder="Escanear Código..."
                            autoFocus
                            onBlur={() => setTimeout(() => inputRef.current?.focus(), 100)} // Aggressive auto-focus
                        />
                        <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-500">
                            <Barcode size={32} />
                        </div>
                    </div>

                    {/* Last Scanned Feedback */}
                    <div className={`mt-8 p-4 rounded-xl bg-slate-800/50 border border-slate-700 transition-all duration-300 ${lastScanned ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                        <p className="text-slate-400 text-sm uppercase font-bold mb-1 text-center">Último Escaneado</p>
                        <p className="text-xl text-white font-bold text-center">{lastScanned}</p>
                    </div>

                    {/* Instructions */}
                    <div className="absolute bottom-8 left-0 right-0 text-center text-slate-600 text-sm">
                        <p className="flex items-center justify-center gap-2">
                            <Volume2 size={16} /> Sonido Activado
                        </p>
                    </div>
                </div>

                {/* Right: List */}
                <div className="w-full lg:w-[450px] bg-slate-800/30 flex flex-col border-l border-slate-700/50">
                    <div className="p-4 border-b border-slate-700/50 bg-slate-800/50">
                        <h3 className="text-white font-bold flex items-center justify-between">
                            <span>Lista de Entrada</span>
                            <span className="bg-slate-700 px-2 py-1 rounded text-xs text-slate-300">{totalLines} Líneas</span>
                        </h3>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                        {scannedItems.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
                                <Package size={48} className="mb-4" />
                                <p>Esperando productos...</p>
                            </div>
                        ) : (
                            scannedItems.map((item, idx) => (
                                <div key={`${item.sku}-${idx}`} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center animate-in slide-in-from-right-4 duration-300">
                                    <div>
                                        <p className="text-white font-bold">{item.name}</p>
                                        <p className="text-xs text-slate-500 font-mono">{item.sku}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="text-2xl font-bold text-cyan-400 tabular-nums">
                                            {item.quantity}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="p-4 border-t border-slate-700/50 bg-slate-800/80 backdrop-blur">
                        <button
                            onClick={handleFinish}
                            className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-900/20 transition-all flex items-center justify-center gap-2"
                        >
                            <Save size={20} /> Finalizar Recepción
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScanReceptionModal;
