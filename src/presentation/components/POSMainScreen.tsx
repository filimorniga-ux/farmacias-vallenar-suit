
'use client';
import React, { useState } from 'react';
import { usePharmaStore } from '../store/useStore';
import { Search, Plus, X, Tag } from 'lucide-react';
import ClinicalSidebar from './clinical/ClinicalSidebar';
import { ClinicalAgent } from '../../domain/logic/clinicalAgent';
import { Customer, HealthTag } from '../../domain/types';

// Componente para la pantalla principal del POS
const POSMainScreen: React.FC = () => {
    const { inventory, cart, addToCart, processSale, user } = usePharmaStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [lastChecked, setLastChecked] = useState(Date.now());

    // Simulación de Cliente (para análisis clínico)
    const MOCK_CUSTOMER: Customer = { rut: '11.111.111-1', name: 'Javiera', age: 35, healthTags: ['PREGNANT'] };

    const filteredInventory = inventory.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) || item.dci.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Ejecutar el agente clínico en cada render de carrito
    const clinicalAnalysis = ClinicalAgent.analyzeCart(cart, MOCK_CUSTOMER);

    const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

    // *Mejora de Contraste aplicada a inputs*
    const inputStyle = "w-full pl-10 pr-4 py-3 border-2 border-slate-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-700 transition-all placeholder-slate-500 text-slate-900";


    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 h-screen overflow-hidden">

            {/* Columna 1: Inventario y Búsqueda */}
            <div className="md:col-span-2 flex flex-col bg-slate-50 p-4 rounded-xl shadow-inner">
                <h2 className="text-2xl font-extrabold text-slate-900 mb-4">Punto de Venta ({user?.role})</h2>
                <div className="relative mb-6">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" size={20} />
                    <input
                        type="text"
                        placeholder="Buscar medicamento o producto (Nombre/DCI)"
                        className={inputStyle}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Lista de Productos */}
                <div className="flex-1 overflow-y-auto pr-2 grid grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredInventory.map(item => (
                        <div key={item.id} className="bg-white p-4 rounded-xl shadow-md border border-slate-200 hover:shadow-lg transition cursor-pointer flex flex-col justify-between"
                            onClick={() => addToCart(item, 1)}>
                            <div>
                                <p className="text-sm font-semibold text-slate-700 mb-1">{item.name}</p>
                                <p className="text-xs text-cyan-700 font-mono">CLP ${item.price.toLocaleString('es-CL')}</p>
                            </div>
                            <div className="mt-3 flex items-center justify-between">
                                <span className={`text-xs px-2 py-1 rounded-full font-medium ${item.isColdChain ? 'bg-blue-100 text-blue-700' : item.isBioequivalent ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                    {item.isColdChain ? '❄️ FRÍO' : item.isBioequivalent ? 'BIOEQ' : 'OTC'}
                                </span>
                                <Plus size={20} className="text-cyan-700 hover:scale-110 transition" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Columna 2: Carrito y Análisis Clínico */}
            <div className="flex flex-col gap-6">

                {/* Carrito de Compras */}
                <div className="flex-1 bg-white p-4 rounded-xl shadow-lg flex flex-col">
                    <h3 className="text-xl font-bold text-slate-900 mb-3 border-b pb-2">🛒 Carrito ({cart.length})</h3>
                    <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                        {cart.map((item, index) => (
                            <div key={index} className="flex justify-between items-center text-sm border-b pb-2 last:border-b-0">
                                <div className="flex-1 pr-2">
                                    <p className="font-medium text-slate-800">{item.name}</p>
                                    <p className="text-xs text-slate-500 flex items-center"><Tag size={12} className='mr-1' /> {item.isCommissionable ? 'Retail' : 'Medicamento'}</p>
                                </div>
                                <p className="font-mono text-right text-slate-700 w-16">${(item.price * item.quantity).toLocaleString('es-CL')}</p>
                                {/* Botón de eliminar, solo visual en este MVP */}
                                <X size={16} className='text-red-500 ml-2 cursor-pointer' onClick={() => alert('Eliminar item no implementado')} />
                            </div>
                        ))}
                    </div>

                    {/* Totales y Pago */}
                    <div className="mt-4 pt-4 border-t border-slate-200">
                        <div className="flex justify-between font-bold text-xl text-slate-900 mb-4">
                            <span>TOTAL:</span>
                            <span>${cartTotal.toLocaleString('es-CL')}</span>
                        </div>
                        <button
                            className="w-full py-4 bg-emerald-600 text-white font-extrabold text-lg rounded-xl hover:bg-emerald-700 transition disabled:opacity-50"
                            onClick={processSale}
                            disabled={cart.length === 0 || clinicalAnalysis.status === 'BLOCK'}
                        >
                            {clinicalAnalysis.status === 'BLOCK' ? '⛔ BLOQUEADO Q.F.' : 'Pagar y Emitir Boleta'}
                        </button>
                    </div>
                </div>

                {/* AI Copilot */}
                <ClinicalSidebar analysis={clinicalAnalysis} lastChecked={lastChecked} />
            </div>
        </div>
    );
};

export default POSMainScreen;
