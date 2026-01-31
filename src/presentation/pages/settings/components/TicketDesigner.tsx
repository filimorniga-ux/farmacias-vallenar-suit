import React, { useState, useEffect } from 'react';
import { useLocationStore } from '../../../store/useLocationStore';
import { usePharmaStore } from '../../../store/useStore';
import TicketBoleta from '../../../components/printing/TicketBoleta';
import SimpleWysiwyg from '../../../components/common/SimpleWysiwyg';
import { LocationConfig, TicketType, TicketTemplate } from '../../../../domain/types';
import { Save, Printer, RefreshCw, FileText, Receipt, ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';
import { updateLocationSecure } from '../../../../actions/locations-v2';
import ShiftHandoverTicket from '@/presentation/components/printing/ShiftHandoverTicket';

const TicketDesigner: React.FC = () => {
    const { currentLocation, updateLocation, fetchLocations, isLoading } = useLocationStore();
    const { user } = usePharmaStore();

    // Active Tab State
    const [activeTab, setActiveTab] = useState<TicketType>('SALE');

    // Local state for editing templates
    // Default structure if undefined
    const defaultTemplate: TicketTemplate = {
        header_content: '<h2 style="text-align: center;">FARMACIAS VALLENAR</h2><div style="text-align: center;">Av. Matta 550, Vallenar</div>',
        footer_content: '<div style="text-align: center; font-weight: bold;">¡Gracias por su preferencia!</div>',
        show_logo: true,
        show_customer_data: true
    };

    const [templates, setTemplates] = useState<Record<TicketType, TicketTemplate>>({
        SALE: { ...defaultTemplate },
        QUOTE: { ...defaultTemplate, header_content: '<h2 style="text-align: center;">COTIZACIÓN</h2>' },
        SHIFT_HANDOVER: { ...defaultTemplate, header_content: '<h2 style="text-align: center;">CIERRE DE TURNO</h2>' },
        RECEIPT: { ...defaultTemplate, header_content: '<h2 style="text-align: center;">RECIBO DE CAJA</h2><div style="text-align: center;">Comprobante Interno</div><br />' }
    });

    // Mock Data for Previews
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

    const mockHandoverConfig: any = {
        userName: 'Juan Cajero',
        terminalName: 'Caja 1',
        locationName: currentLocation?.name || 'Sucursal Centro',
        timestamp: new Date(),
        summary: {
            shiftId: 'mock-shift',
            startTime: Date.now() - 28800000,
            endTime: Date.now(),
            totalSales: 150000,
            cashExpected: 50000,
            cashCounted: 50000,
            difference: 0,
            movements: [],
            paymentMethodTotals: { CASH: 50000, DEBIT: 100000 }
        }
    };

    // Load initial config from location
    useEffect(() => {
        if (user?.id) {
            console.log('🔄 [TicketDesigner] Mounting, requesting fresh locations...');
            fetchLocations(true);
        }
    }, [user?.id]);
    const templatesConfigStr = JSON.stringify(currentLocation?.config?.templates);

    useEffect(() => {
        if (currentLocation?.config?.templates) {
            console.log('🔄 Syncing templates from store/server...');
            // Merge existing templates with defaults to ensure all keys exist
            setTemplates(prev => ({
                ...prev,
                ...currentLocation.config?.templates
            }));
        }
    }, [templatesConfigStr]); // Reload when the CONTENT of the config changes, not just the ID.

    const handleSave = async () => {
        if (!currentLocation) {
            console.error('❌ HandleSave: No currentLocation found');
            return;
        }

        console.log('💾 HandleSave: Starting save process...');
        console.log('📄 Current Templates State:', templates);

        const newConfig: LocationConfig = {
            ...currentLocation.config,
            templates: templates
        };

        console.log('📦 New Config Payload:', newConfig);

        // Optimistic Update
        updateLocation(currentLocation.id, { config: newConfig });
        console.log('✅ Optimistic Update applied to local store');

        try {
            const result = await updateLocationSecure({
                locationId: currentLocation.id,
                config: newConfig
            });

            console.log('📡 Server Response:', result);

            if (result.success) {
                toast.success('Diseños guardados y sincronizados');
                console.log('📡 [TicketDesigner] Save success, re-fetching to verify UI...');
                await fetchLocations(true);
            } else {
                console.error('❌ Server Error:', result.error);
                toast.error('Guardado localmente, pero falló la sincronización: ' + result.error);
            }
        } catch (error) {
            console.error('💥 Unexpected Error in handleSave:', error);
            toast.error('Error inesperado al guardar');
        }
    };

    const updateCurrentTemplate = (key: keyof TicketTemplate, value: any) => {
        setTemplates(prev => ({
            ...prev,
            [activeTab]: {
                ...prev[activeTab],
                [key]: value
            }
        }));
    };

    if (!currentLocation) return <div className="p-8 text-center text-slate-500">Selecciona una sucursal para editar.</div>;

    const currentTemplate = templates[activeTab];

    const getVariablesForTab = (tab: TicketType) => {
        const commonars = [
            { key: 'fecha', label: 'Fecha Actual' },
            { key: 'hora', label: 'Hora Actual' },
            { key: 'sucursal', label: 'Nombre Sucursal' },
            { key: 'cajero', label: 'Cajero' },
            { key: 'vendedor', label: 'Vendedor' },
        ];
        if (tab === 'SALE' || tab === 'QUOTE' || tab === 'RECEIPT') {
            return [
                ...commonars,
                { key: 'cliente', label: 'Nombre Cliente' },
                { key: 'rut_cliente', label: 'RUT Cliente' },
                { key: 'folio', label: 'Folio Boleta' }
            ];
        }
        if (tab === 'SHIFT_HANDOVER') return [...commonars, { key: 'supervisor', label: 'Nombre Supervisor' }];
        return commonars;
    }

    return (
        <div className="flex flex-col lg:flex-row h-[calc(100vh-100px)] gap-6 p-4">

            {/* Left Panel: Controls */}
            <div className="w-full lg:w-5/12 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col">
                <div className="p-6 border-b border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-xl font-bold text-slate-800">Editor de Recibos</h2>
                        <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-1 rounded-full font-bold">POS 80mm</span>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-200">
                    <button
                        onClick={() => setActiveTab('SALE')}
                        className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'SALE' ? 'border-slate-800 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        <Receipt size={16} /> Ventas (Boleta)
                    </button>
                    <button
                        onClick={() => setActiveTab('RECEIPT')}
                        className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'RECEIPT' ? 'border-slate-800 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        <FileText size={16} /> Recibo Manual
                    </button>
                    <button
                        onClick={() => setActiveTab('QUOTE')}
                        className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'QUOTE' ? 'border-slate-800 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        <FileText size={16} /> Cotización
                    </button>
                    <button
                        onClick={() => setActiveTab('SHIFT_HANDOVER')}
                        className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'SHIFT_HANDOVER' ? 'border-slate-800 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        <ArrowRightLeft size={16} /> Cierre Turno
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    {/* Header Editor */}
                    <div>
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Encabezado</h3>
                        <SimpleWysiwyg
                            label="Contenido Superior"
                            value={currentTemplate.header_content || ''}
                            onChange={(val: string) => updateCurrentTemplate('header_content', val)}
                            availableVariables={getVariablesForTab(activeTab)}
                        />
                        <div className="mt-2 flex items-center gap-2">
                            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={currentTemplate.show_logo}
                                    onChange={(e) => updateCurrentTemplate('show_logo', e.target.checked)}
                                    className="rounded text-cyan-600 focus:ring-cyan-500"
                                />
                                Mostrar Logo (si existe)
                            </label>
                        </div>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-center text-sm text-slate-400 font-mono">
                        [ ÁREA DEL DETALLE DEL DOCUMENTO - NO EDITABLE ]
                        <br />
                        <span className="text-xs">(Items, totales, impuestos se generan automáticamente)</span>
                    </div>

                    {/* Footer Editor */}
                    <div>
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Pie de Página</h3>
                        <SimpleWysiwyg
                            label="Contenido Inferior"
                            value={currentTemplate.footer_content || ''}
                            onChange={(val: string) => updateCurrentTemplate('footer_content', val)}
                            availableVariables={getVariablesForTab(activeTab)}
                        />
                    </div>

                    <div className="pt-4 space-y-3">
                        <button
                            onClick={handleSave}
                            disabled={isLoading}
                            className={`w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-slate-200 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <Save size={18} />
                            {isLoading ? 'Guardando...' : 'Guardar Todos los Diseños'}
                        </button>

                        <button
                            onClick={() => fetchLocations(true)}
                            disabled={isLoading}
                            className="w-full py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
                        >
                            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                            Recargar desde el Servidor
                        </button>
                    </div>
                </div>
            </div>

            {/* Right Panel: Preview */}
            <div className="w-full lg:w-7/12 bg-slate-100 rounded-2xl border border-slate-200 flex flex-col items-center justify-center p-8 relative overflow-hidden">
                <div className="absolute top-4 right-4 bg-white/80 backdrop-blur px-3 py-1 rounded-full text-xs font-mono text-slate-500 border border-slate-200 flex items-center gap-2 shadow-sm z-20">
                    <Printer size={12} />
                    Vista Previa ({activeTab})
                </div>

                {/* Thermal Paper Simulation */}
                <div className="relative group max-h-full overflow-y-auto no-scrollbar py-8">
                    <div className="absolute -inset-1 bg-gradient-to-b from-slate-200 to-slate-300 rounded-sm blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>

                    <div className="relative transform transition-all duration-300 origin-top hover:scale-[1.01] shadow-xl">
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
                        {activeTab === 'SALE' && (
                            <TicketBoleta
                                sale={mockSale}
                                companyName="VISTA PREVIA"
                                template={currentTemplate} // New Prop
                                cashierName="Cajero Demo"
                                branchName="Sucursal Norte"
                            />
                        )}
                        {activeTab === 'QUOTE' && (
                            <TicketBoleta
                                sale={{ ...mockSale, dte_status: undefined }} // Simulate quote
                                companyName="VISTA PREVIA"
                                template={currentTemplate}
                                isQuote
                                cashierName="Cajero Demo"
                                branchName="Sucursal Norte"
                            />
                        )}
                        {activeTab === 'SHIFT_HANDOVER' && (
                            <ShiftHandoverTicket
                                {...mockHandoverConfig}
                                template={currentTemplate}
                            />
                        )}
                        {activeTab === 'RECEIPT' && (
                            <TicketBoleta
                                sale={{
                                    ...mockSale,
                                    dte_status: undefined, // No DTE
                                    is_internal_ticket: true
                                }}
                                companyName="VISTA PREVIA"
                                template={currentTemplate}
                                cashierName="Cajero Demo"
                                branchName="Sucursal Norte"
                            />
                        )}

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

                <p className="absolute bottom-4 left-0 right-0 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
                    <RefreshCw size={14} /> Vista previa en tiempo real
                </p>
            </div>
        </div>
    );
};

export default TicketDesigner;
