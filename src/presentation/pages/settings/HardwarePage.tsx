import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Printer, Scan, Settings, CheckCircle, Barcode, Zap, Building, MessageSquare, Image, RefreshCw, Monitor } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { PrinterService } from '../../../infrastructure/services/PrinterService';
import { toast } from 'sonner';

interface PrinterInfo {
    name: string;
    isDefault: boolean;
    status: number;
}

const HardwarePage: React.FC = () => {
    const navigate = useNavigate();
    const { hardware, updateHardwareConfig } = useSettingsStore();
    const [testBarcode, setTestBarcode] = useState('');
    const [scanSpeed, setScanSpeed] = useState<number | null>(null);
    const lastKeyTime = useRef<number>(0);

    // Printer Detection State
    const [availablePrinters, setAvailablePrinters] = useState<PrinterInfo[]>([]);
    const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
    const isElectron = PrinterService.isElectron();

    // Load printers on mount (Electron only)
    useEffect(() => {
        if (isElectron) {
            loadPrinters();
        }
    }, [isElectron]);

    const loadPrinters = async () => {
        setIsLoadingPrinters(true);
        try {
            const printers = await PrinterService.getAvailablePrinters();
            setAvailablePrinters(printers);
        } catch (error) {
            console.error('Failed to load printers:', error);
        } finally {
            setIsLoadingPrinters(false);
        }
    };

    const handleScanTest = (e: React.ChangeEvent<HTMLInputElement>) => {
        const now = performance.now();
        const timeDiff = now - lastKeyTime.current;
        lastKeyTime.current = now;

        setTestBarcode(e.target.value);

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
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            <div className="flex items-center gap-3 mb-6">
                <div className="bg-blue-100 p-3 rounded-xl text-blue-600">
                    <Settings size={28} />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-gray-800">Hardware & Periféricos</h1>
                    <p className="text-sm text-gray-500">Configuración de impresoras, etiquetas y lectores de código</p>
                </div>
            </div>

            {/* Electron Badge */}
            {isElectron && (
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-3 flex items-center gap-3">
                    <Monitor className="text-indigo-600" size={20} />
                    <span className="text-sm font-medium text-indigo-800">
                        Modo Escritorio - Impresión nativa habilitada
                    </span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* POS Printer Config */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <h2 className="font-bold text-gray-800 flex items-center gap-2">
                            <Printer className="text-blue-500" size={18} />
                            Impresora de Tickets (POS)
                        </h2>
                        <span className="text-xs font-bold px-2 py-1 bg-blue-100 text-blue-600 rounded">Caja</span>
                    </div>
                    <div className="p-4 space-y-4">
                        {/* Printer Selection (Electron only) */}
                        {isElectron && (
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                                    Dispositivo
                                    <button onClick={loadPrinters} className="text-blue-500 hover:text-blue-700" title="Recargar">
                                        <RefreshCw size={14} className={isLoadingPrinters ? 'animate-spin' : ''} />
                                    </button>
                                </label>
                                <select
                                    value={hardware.pos_printer_name || ''}
                                    onChange={(e) => updateHardwareConfig({ pos_printer_name: e.target.value || undefined })}
                                    className="w-full p-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                >
                                    <option value="">Usar diálogo del sistema</option>
                                    {availablePrinters.map(p => (
                                        <option key={p.name} value={p.name}>
                                            {p.name} {p.isDefault ? '(Predeterminada)' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Ancho del Papel</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => updateHardwareConfig({ pos_printer_width: '80mm' })}
                                    className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-1 ${hardware.pos_printer_width === '80mm'
                                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                                        : 'border-gray-200 hover:border-gray-300 text-gray-500'
                                        }`}
                                >
                                    <span className="text-xl font-bold">80mm</span>
                                    <span className="text-xs">Estándar</span>
                                </button>
                                <button
                                    onClick={() => updateHardwareConfig({ pos_printer_width: '58mm' })}
                                    className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-1 ${hardware.pos_printer_width === '58mm'
                                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                                        : 'border-gray-200 hover:border-gray-300 text-gray-500'
                                        }`}
                                >
                                    <span className="text-lg font-bold">58mm</span>
                                    <span className="text-xs">Compacto</span>
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                            <div>
                                <span className="block font-bold text-gray-700 text-sm">Impresión Automática</span>
                                <span className="text-xs text-gray-500">Imprimir al finalizar venta</span>
                            </div>
                            <button
                                onClick={() => updateHardwareConfig({ auto_print_pos: !hardware.auto_print_pos })}
                                className={`w-11 h-6 rounded-full transition-colors relative ${hardware.auto_print_pos ? 'bg-green-500' : 'bg-gray-300'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${hardware.auto_print_pos ? 'left-6' : 'left-1'}`} />
                            </button>
                        </div>

                        <button
                            onClick={handleTestTicket}
                            className="w-full py-2.5 bg-gray-800 text-white font-bold rounded-lg hover:bg-gray-900 transition-colors flex items-center justify-center gap-2 text-sm"
                        >
                            <Printer size={16} />
                            Probar Ticket
                        </button>

                        <button
                            onClick={() => navigate('/settings/printing')}
                            className="w-full py-2.5 bg-cyan-600 text-white font-bold rounded-lg hover:bg-cyan-700 transition-colors flex items-center justify-center gap-2 text-sm"
                        >
                            <Image size={16} />
                            Diseñador Visual de Tickets
                        </button>
                    </div>
                </div>

                {/* Ticket Customization */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <h2 className="font-bold text-gray-800 flex items-center gap-2">
                            <Building className="text-cyan-500" size={18} />
                            Datos de Empresa
                        </h2>
                        <span className="text-xs font-bold px-2 py-1 bg-cyan-100 text-cyan-600 rounded">Tickets</span>
                    </div>
                    <div className="p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">Nombre</label>
                                <input
                                    type="text"
                                    value={hardware.ticket_company_name || ''}
                                    onChange={(e) => updateHardwareConfig({ ticket_company_name: e.target.value })}
                                    placeholder="Farmacia Vallenar"
                                    className="w-full p-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">RUT</label>
                                <input
                                    type="text"
                                    value={hardware.ticket_company_rut || ''}
                                    onChange={(e) => updateHardwareConfig({ ticket_company_rut: e.target.value })}
                                    placeholder="76.123.456-7"
                                    className="w-full p-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">Dirección</label>
                            <input
                                type="text"
                                value={hardware.ticket_company_address || ''}
                                onChange={(e) => updateHardwareConfig({ ticket_company_address: e.target.value })}
                                placeholder="Av. Matta 123, Vallenar"
                                className="w-full p-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">Teléfono</label>
                                <input
                                    type="text"
                                    value={hardware.ticket_company_phone || ''}
                                    onChange={(e) => updateHardwareConfig({ ticket_company_phone: e.target.value })}
                                    placeholder="+56 9 1234 5678"
                                    className="w-full p-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">Redes Sociales</label>
                                <input
                                    type="text"
                                    value={hardware.ticket_social_media || ''}
                                    onChange={(e) => updateHardwareConfig({ ticket_social_media: e.target.value })}
                                    placeholder="@farmaciasvallenar"
                                    className="w-full p-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Ticket Messages */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <h2 className="font-bold text-gray-800 flex items-center gap-2">
                            <MessageSquare className="text-amber-500" size={18} />
                            Mensajes en Tickets
                        </h2>
                        <span className="text-xs font-bold px-2 py-1 bg-amber-100 text-amber-600 rounded">Promoción</span>
                    </div>
                    <div className="p-4 space-y-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">Mensaje de Despedida</label>
                            <input
                                type="text"
                                value={hardware.ticket_footer_message || ''}
                                onChange={(e) => updateHardwareConfig({ ticket_footer_message: e.target.value })}
                                placeholder="¡Gracias por su preferencia!"
                                className="w-full p-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">Promoción Activa (Opcional)</label>
                            <input
                                type="text"
                                value={hardware.ticket_promo_message || ''}
                                onChange={(e) => updateHardwareConfig({ ticket_promo_message: e.target.value })}
                                placeholder="Ej: 20% OFF en protector solar"
                                className="w-full p-2 rounded-lg border border-amber-200 bg-amber-50 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                                <span className="text-xs font-bold text-gray-600">Puntos Cliente</span>
                                <button
                                    onClick={() => updateHardwareConfig({ ticket_show_loyalty_points: !hardware.ticket_show_loyalty_points })}
                                    className={`w-10 h-5 rounded-full transition-colors relative ${hardware.ticket_show_loyalty_points ? 'bg-green-500' : 'bg-gray-300'}`}
                                >
                                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${hardware.ticket_show_loyalty_points ? 'left-5' : 'left-0.5'}`} />
                                </button>
                            </div>
                            <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                                <span className="text-xs font-bold text-gray-600">Ahorro</span>
                                <button
                                    onClick={() => updateHardwareConfig({ ticket_show_savings: !hardware.ticket_show_savings })}
                                    className={`w-10 h-5 rounded-full transition-colors relative ${hardware.ticket_show_savings ? 'bg-green-500' : 'bg-gray-300'}`}
                                >
                                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${hardware.ticket_show_savings ? 'left-5' : 'left-0.5'}`} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Label Printer */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <h2 className="font-bold text-gray-800 flex items-center gap-2">
                            <Barcode className="text-purple-500" size={18} />
                            Impresora de Etiquetas
                        </h2>
                        <span className="text-xs font-bold px-2 py-1 bg-purple-100 text-purple-600 rounded">Bodega</span>
                    </div>
                    <div className="p-4 space-y-4">
                        {isElectron && (
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                                    Dispositivo
                                    <button onClick={loadPrinters} className="text-purple-500 hover:text-purple-700" title="Recargar">
                                        <RefreshCw size={14} className={isLoadingPrinters ? 'animate-spin' : ''} />
                                    </button>
                                </label>
                                <select
                                    value={hardware.label_printer_name || ''}
                                    onChange={(e) => updateHardwareConfig({ label_printer_name: e.target.value || undefined })}
                                    className="w-full p-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                                >
                                    <option value="">Usar diálogo del sistema</option>
                                    {availablePrinters.map(p => (
                                        <option key={p.name} value={p.name}>
                                            {p.name} {p.isDefault ? '(Predeterminada)' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Tamaño de Etiqueta</label>
                            <select
                                value={hardware.label_printer_size}
                                onChange={(e) => updateHardwareConfig({ label_printer_size: e.target.value as any })}
                                className="w-full p-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                            >
                                <option value="50x25">50mm x 25mm (Estándar Farmacia)</option>
                                <option value="100x50">100mm x 50mm (Caja/Bulto)</option>
                            </select>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                            <div>
                                <span className="block font-bold text-gray-700 text-sm">Impresión Automática</span>
                                <span className="text-xs text-gray-500">Imprimir al recepcionar stock</span>
                            </div>
                            <button
                                onClick={() => updateHardwareConfig({ auto_print_labels: !hardware.auto_print_labels })}
                                className={`w-11 h-6 rounded-full transition-colors relative ${hardware.auto_print_labels ? 'bg-green-500' : 'bg-gray-300'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${hardware.auto_print_labels ? 'left-6' : 'left-1'}`} />
                            </button>
                        </div>

                        <button
                            onClick={handleTestLabel}
                            className="w-full py-2.5 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 text-sm"
                        >
                            <Barcode size={16} />
                            Probar Etiqueta
                        </button>
                    </div>
                </div>

                {/* Scanner Test - Full Width */}
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <h2 className="font-bold text-gray-800 flex items-center gap-2">
                            <Scan className="text-orange-500" size={18} />
                            Prueba de Escáner
                        </h2>
                        <div className="flex gap-2">
                            <span className={`text-xs font-bold px-2 py-1 rounded ${hardware.scanner_mode === 'KEYBOARD_WEDGE' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>Teclado</span>
                            <span className={`text-xs font-bold px-2 py-1 rounded ${hardware.scanner_mode === 'HID' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>HID</span>
                        </div>
                    </div>
                    <div className="p-4">
                        <div className="flex gap-4 items-center">
                            <div className="flex-1">
                                <label className="block text-sm font-bold text-gray-700 mb-2">Área de Prueba</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={testBarcode}
                                        onChange={handleScanTest}
                                        placeholder="Haga clic aquí y escanee un código..."
                                        className="w-full p-3 pl-10 rounded-lg border-2 border-dashed border-gray-300 focus:border-orange-500 focus:ring-4 focus:ring-orange-100 outline-none text-base font-mono transition-all"
                                    />
                                    <Scan className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                </div>
                            </div>
                            <div className="w-36 p-3 bg-gray-50 rounded-lg border border-gray-100 text-center">
                                <p className="text-xs font-bold text-gray-500 uppercase mb-1">Velocidad</p>
                                <div className="flex items-center justify-center gap-1">
                                    <Zap size={16} className={scanSpeed !== null ? 'text-yellow-500' : 'text-gray-300'} />
                                    <span className="text-xl font-bold text-gray-800">{scanSpeed ? `${scanSpeed}ms` : '--'}</span>
                                </div>
                            </div>
                        </div>
                        {testBarcode && (
                            <div className="mt-3 p-2 bg-green-50 border border-green-100 rounded-lg flex items-center gap-2 text-green-700 text-sm">
                                <CheckCircle size={16} />
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
