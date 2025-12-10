import React, { useState, useEffect } from 'react';
import { useLocationStore } from '../../../store/useLocationStore';
import { usePharmaStore } from '../../../store/useStore';
import TicketBoleta from '../../../components/printing/TicketBoleta';
import { LocationConfig } from '../../../../domain/types';
import { Save, Printer, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { updateLocation as updateLocationAction } from '../../../../actions/locations';

const TicketDesigner: React.FC = () => {
    const { currentLocation, updateLocation, locations } = useLocationStore();
    const { user } = usePharmaStore();

    // Local state for editing
    const [config, setConfig] = useState<NonNullable<LocationConfig['receipt_template']>>({
        header_text: 'FARMACIAS VALLENAR',
        show_logo: true,
        footer_text: '¡Gracias por su preferencia!',
        social_media: '@farmaciasvallenar',
        show_barcode: true
    });

    // Mock Sale for Preview
    const mockSale: any = {
        id: 'preview-123',
        timestamp: Date.now(),
        dte_folio: '123456',
        dte_status: 'CONFIRMED_DTE',
        total: 15990,
        payment_method: 'DEBIT',
        items: [
            { name: 'Paracetamol 500mg', quantity: 2, price: 2990 },
            { name: 'Ibuprofeno 400mg', quantity: 1, price: 4990 },
            { name: 'Vitamina C 1000mg', quantity: 1, price: 5020 }
        ],
        customer: { name: 'Juan Pérez' }
    };

    // Load initial config from location
    useEffect(() => {
        if (currentLocation?.config?.receipt_template) {
            setConfig(currentLocation.config.receipt_template as NonNullable<LocationConfig['receipt_template']>);
        }
    }, [currentLocation]);

    const handleSave = async () => {
        if (!currentLocation) return;

        const newConfig: LocationConfig = {
            ...currentLocation.config,
            receipt_template: config
        };

        // Optimistic Update
        updateLocation(currentLocation.id, { config: newConfig });

        // Backend Persistence
        const result = await updateLocationAction(currentLocation.id, { config: newConfig });

        if (result.success) {
            toast.success('Diseño de ticket guardado y sincronizado');
        } else {
            toast.error('Guardado localmente, pero falló la sincronización: ' + result.error);
        }
    };

    if (!currentLocation) return <div className="p-8 text-center text-slate-500">Selecciona una sucursal para editar.</div>;

    return (
        <div className="flex flex-col lg:flex-row h-[calc(100vh-100px)] gap-6 p-4">

            {/* Left Panel: Controls */}
            <div className="w-full lg:w-1/3 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-slate-800">Editor de Ticket</h2>
                    <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-1 rounded-full font-bold">POS 80mm</span>
                </div>

                <div className="space-y-6">
                    {/* Header Section */}
                    <div>
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Encabezado</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Texto Principal</label>
                                <input
                                    type="text"
                                    value={config.header_text || ''}
                                    onChange={e => setConfig({ ...config, header_text: e.target.value })}
                                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none"
                                    placeholder="Nombre de Fantasía"
                                />
                            </div>

                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                                <span className="text-sm text-slate-700 font-medium">Mostrar Logo</span>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={config.show_logo || false}
                                        onChange={e => setConfig({ ...config, show_logo: e.target.checked })}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
                                </label>
                            </div>
                        </div>
                    </div>

                    <hr className="border-slate-100" />

                    {/* Footer Section */}
                    <div>
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Pie de Página</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Mensaje de Despedida</label>
                                <textarea
                                    value={config.footer_text || ''}
                                    onChange={e => setConfig({ ...config, footer_text: e.target.value })}
                                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none"
                                    rows={2}
                                    placeholder="Gracias por su compra..."
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Redes Sociales / Contacto</label>
                                <input
                                    type="text"
                                    value={config.social_media || ''}
                                    onChange={e => setConfig({ ...config, social_media: e.target.value })}
                                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none"
                                    placeholder="@instagram / www.web.cl"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-6">
                        <button
                            onClick={handleSave}
                            className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                        >
                            <Save size={18} />
                            Guardar Diseño
                        </button>
                    </div>
                </div>
            </div>

            {/* Right Panel: Preview */}
            <div className="w-full lg:w-2/3 bg-slate-100 rounded-2xl border border-slate-200 flex flex-col items-center justify-center p-8 relative overflow-hidden">
                <div className="absolute top-4 right-4 bg-white/80 backdrop-blur px-3 py-1 rounded-full text-xs font-mono text-slate-500 border border-slate-200 flex items-center gap-2">
                    <Printer size={12} />
                    Vista Previa (80mm)
                </div>

                {/* Thermal Paper Simulation */}
                <div className="relative group">
                    <div className="absolute -inset-1 bg-gradient-to-b from-slate-200 to-slate-300 rounded-sm blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>

                    {/* The Ticket Component Logic Reused */}
                    <div className="relative transform transition-all duration-300 origin-top hover:scale-[1.02]">
                        {/* Paper Tear Effect Top */}
                        <div
                            className="h-4 w-full bg-white relative z-10"
                            style={{
                                maskImage: 'linear-gradient(45deg, transparent 5px, black 5px), linear-gradient(-45deg, transparent 5px, black 5px)',
                                maskSize: '10px 10px',
                                maskRepeat: 'repeat-x',
                                maskPosition: 'bottom'
                            }}
                        />

                        {/* Content */}
                        <TicketBoleta
                            sale={mockSale}
                            companyName={config.header_text || currentLocation.name}
                            config={config}
                        />

                        {/* Paper Tear Effect Bottom */}
                        <div
                            className="h-4 w-full bg-white relative z-10 rotate-180"
                            style={{
                                maskImage: 'linear-gradient(45deg, transparent 5px, black 5px), linear-gradient(-45deg, transparent 5px, black 5px)',
                                maskSize: '10px 10px',
                                maskRepeat: 'repeat-x',
                                maskPosition: 'bottom'
                            }}
                        />
                    </div>
                </div>

                <p className="mt-8 text-slate-400 text-sm flex items-center gap-2">
                    <RefreshCw size={14} /> Los cambios se verán reflejados automáticamente en todas las cajas de {currentLocation.name}.
                </p>
            </div>
        </div>
    );
};

export default TicketDesigner;
