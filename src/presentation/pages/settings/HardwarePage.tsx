import React, { useState, useRef } from 'react';
import { Printer, Scan, Settings, Save, CheckCircle, AlertTriangle, Barcode, Zap } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { PrinterService } from '../../../infrastructure/services/PrinterService';
import { toast } from 'sonner';

const HardwarePage: React.FC = () => {
    const { hardware, updateHardwareConfig } = useSettingsStore();
    const [testBarcode, setTestBarcode] = useState('');
    const [scanSpeed, setScanSpeed] = useState<number | null>(null);
    const lastKeyTime = useRef<number>(0);

    const handleScanTest = (e: React.ChangeEvent<HTMLInputElement>) => {
        const now = performance.now();
        const timeDiff = now - lastKeyTime.current;
        lastKeyTime.current = now;

        setTestBarcode(e.target.value);

        // Simple heuristic: if typing is super fast (<50ms per char), it's likely a scanner
        if (timeDiff < 50 && e.target.value.length > 2) {
            setScanSpeed(Math.round(timeDiff));
        } else {
            setScanSpeed(null);
        }
    };

    const handleTestTicket = () => {
        PrinterService.printTestTicket(hardware);
        toast.success('Enviando ticket de prueba...');
    };

    const handleTestLabel = () => {
        PrinterService.printLabel({
            name: 'PARACETAMOL 500MG',
            sku: '780000123456',
            price: 1990,
            barcode: '780000123456'
        }, hardware);
        toast.success('Enviando etiqueta de prueba...');
    };

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-8">
            <div className="flex items-center gap-3 mb-8">
                <div className="bg-blue-100 p-3 rounded-xl text-blue-600">
                    <Settings size={32} />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Hardware & Periféricos</h1>
                    <p className="text-gray-500">Configuración de impresoras, etiquetas y lectores de código</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* POS Printer Config */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <h2 className="font-bold text-gray-800 flex items-center gap-2">
                            <Printer className="text-blue-500" />
                            Impresora de Tickets (POS)
                        </h2>
                        <span className="text-xs font-bold px-2 py-1 bg-blue-100 text-blue-600 rounded">Caja / Mesón</span>
                    </div>
                    <div className="p-6 space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Ancho del Papel</label>
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => updateHardwareConfig({ pos_printer_width: '80mm' })}
                                    className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${hardware.pos_printer_width === '80mm'
                                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                                        : 'border-gray-200 hover:border-gray-300 text-gray-500'
                                        }`}
                                >
                                    <span className="text-2xl font-bold">80mm</span>
                                    <span className="text-xs">Estándar</span>
                                </button>
                                <button
                                    onClick={() => updateHardwareConfig({ pos_printer_width: '58mm' })}
                                    className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${hardware.pos_printer_width === '58mm'
                                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                                        : 'border-gray-200 hover:border-gray-300 text-gray-500'
                                        }`}
                                >
                                    <span className="text-xl font-bold">58mm</span>
                                    <span className="text-xs">Compacto</span>
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                            <div>
                                <span className="block font-bold text-gray-700">Impresión Automática</span>
                                <span className="text-xs text-gray-500">Imprimir al finalizar venta sin preguntar</span>
                            </div>
                            <button
                                onClick={() => updateHardwareConfig({ auto_print_pos: !hardware.auto_print_pos })}
                                className={`w-12 h-6 rounded-full transition-colors relative ${hardware.auto_print_pos ? 'bg-green-500' : 'bg-gray-300'
                                    }`}
                            >
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${hardware.auto_print_pos ? 'left-7' : 'left-1'
                                    }`} />
                            </button>
                        </div>

                        <button
                            onClick={handleTestTicket}
                            className="w-full py-3 bg-gray-800 text-white font-bold rounded-xl hover:bg-gray-900 transition-colors flex items-center justify-center gap-2"
                        >
                            <Printer size={18} />
                            Probar Ticket de Prueba
                        </button>
                    </div>
                </div>

                {/* Label Printer Config */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <h2 className="font-bold text-gray-800 flex items-center gap-2">
                            <Barcode className="text-purple-500" />
                            Impresora de Etiquetas
                        </h2>
                        <span className="text-xs font-bold px-2 py-1 bg-purple-100 text-purple-600 rounded">Bodega</span>
                    </div>
                    <div className="p-6 space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Tamaño de Etiqueta</label>
                            <select
                                value={hardware.label_printer_size}
                                onChange={(e) => updateHardwareConfig({ label_printer_size: e.target.value as any })}
                                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-purple-500 outline-none"
                            >
                                <option value="50x25">50mm x 25mm (Estándar Farmacia)</option>
                                <option value="100x50">100mm x 50mm (Caja/Bulto)</option>
                            </select>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                            <div>
                                <span className="block font-bold text-gray-700">Impresión Automática</span>
                                <span className="text-xs text-gray-500">Imprimir al recepcionar stock</span>
                            </div>
                            <button
                                onClick={() => updateHardwareConfig({ auto_print_labels: !hardware.auto_print_labels })}
                                className={`w-12 h-6 rounded-full transition-colors relative ${hardware.auto_print_labels ? 'bg-green-500' : 'bg-gray-300'
                                    }`}
                            >
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${hardware.auto_print_labels ? 'left-7' : 'left-1'
                                    }`} />
                            </button>
                        </div>

                        <button
                            onClick={handleTestLabel}
                            className="w-full py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                        >
                            <Barcode size={18} />
                            Probar Etiqueta
                        </button>
                    </div>
                </div>

                {/* Scanner Test */}
                <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <h2 className="font-bold text-gray-800 flex items-center gap-2">
                            <Scan className="text-orange-500" />
                            Prueba de Escáner
                        </h2>
                        <div className="flex gap-2">
                            <span className={`text-xs font-bold px-2 py-1 rounded ${hardware.scanner_mode === 'KEYBOARD_WEDGE' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>Teclado (Wedge)</span>
                            <span className={`text-xs font-bold px-2 py-1 rounded ${hardware.scanner_mode === 'HID' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>HID Nativo</span>
                        </div>
                    </div>
                    <div className="p-6">
                        <div className="flex gap-6 items-center">
                            <div className="flex-1">
                                <label className="block text-sm font-bold text-gray-700 mb-2">Área de Prueba</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={testBarcode}
                                        onChange={handleScanTest}
                                        placeholder="Haga clic aquí y escanee un código..."
                                        className="w-full px-4 py-4 pl-12 rounded-xl border-2 border-dashed border-gray-300 focus:border-orange-500 focus:ring-4 focus:ring-orange-100 outline-none text-lg font-mono transition-all"
                                    />
                                    <Scan className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                </div>
                            </div>
                            <div className="w-48 p-4 bg-gray-50 rounded-xl border border-gray-100 text-center">
                                <p className="text-xs font-bold text-gray-500 uppercase mb-1">Velocidad</p>
                                <div className="flex items-center justify-center gap-2">
                                    <Zap size={18} className={scanSpeed !== null ? 'text-yellow-500' : 'text-gray-300'} />
                                    <span className="text-2xl font-bold text-gray-800">{scanSpeed ? `${scanSpeed}ms` : '--'}</span>
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">Latencia entre caracteres</p>
                            </div>
                        </div>
                        {testBarcode && (
                            <div className="mt-4 p-3 bg-green-50 border border-green-100 rounded-lg flex items-center gap-2 text-green-700">
                                <CheckCircle size={18} />
                                <span className="font-bold">Código detectado:</span>
                                <span className="font-mono">{testBarcode}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HardwarePage;
