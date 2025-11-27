'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Search, ScanBarcode, X, Clock, Info, AlertTriangle } from 'lucide-react';
import { usePharmaStore } from '../store/useStore';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { InventoryBatch } from '../../domain/types';
import { formatProductLabel, calculatePricePerUnit } from '../../domain/logic/productDisplay';
import { motion, AnimatePresence } from 'framer-motion';

const PriceCheckPage: React.FC = () => {
    const { inventory } = usePharmaStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<InventoryBatch | null>(null);
    const [alternatives, setAlternatives] = useState<InventoryBatch[]>([]);
    const [isIdle, setIsIdle] = useState(false);
    const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Reset timer on interaction
    const resetTimer = () => {
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        setIsIdle(false);
        inactivityTimerRef.current = setTimeout(() => {
            handleTimeout();
        }, 15000); // 15 seconds timeout
    };

    const handleTimeout = () => {
        setSearchTerm('');
        setSelectedProduct(null);
        setIsIdle(true);
    };

    useEffect(() => {
        resetTimer();
        window.addEventListener('mousemove', resetTimer);
        window.addEventListener('touchstart', resetTimer);
        window.addEventListener('keydown', resetTimer);
        return () => {
            if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
            window.removeEventListener('mousemove', resetTimer);
            window.removeEventListener('touchstart', resetTimer);
            window.removeEventListener('keydown', resetTimer);
        };
    }, []);

    // Barcode Scanner
    useBarcodeScanner({
        onScan: (sku) => {
            const product = inventory.find(p => p.sku === sku || p.id === sku);
            if (product) {
                setSelectedProduct(product);
                // Find alternatives with same DCI
                const alts = inventory.filter(p =>
                    p.id !== product.id &&
                    p.dci && product.dci &&
                    p.dci.toLowerCase() === product.dci.toLowerCase() &&
                    p.stock_actual > 0
                ).sort((a, b) => a.price - b.price);
                setAlternatives(alts);
                resetTimer();
            }
        }
    });

    // Search Logic
    const filteredProducts = inventory.filter(item => {
        if (!searchTerm) return false;
        const term = searchTerm.toLowerCase();
        return (
            item.name.toLowerCase().includes(term) ||
            item.dci.toLowerCase().includes(term) ||
            (item.laboratory && item.laboratory.toLowerCase().includes(term)) ||
            (item.brand && item.brand.toLowerCase().includes(term))
        );
    }).slice(0, 6); // Limit results

    return (
        <div className="min-h-screen bg-slate-900 text-white overflow-hidden flex flex-col relative">

            {/* Background Elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 opacity-20 pointer-events-none">
                <div className="absolute -top-20 -left-20 w-96 h-96 bg-cyan-500 rounded-full blur-3xl mix-blend-screen animate-pulse" />
                <div className="absolute top-1/2 right-0 w-80 h-80 bg-purple-500 rounded-full blur-3xl mix-blend-screen animate-pulse delay-1000" />
            </div>

            {/* Header */}
            <header className="relative z-10 p-8 flex justify-between items-center">
                <div>
                    <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
                        Consultor de Precios
                    </h1>
                    <p className="text-slate-400 text-lg">Escanee un producto o busque manualmente</p>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 flex items-center gap-3">
                    <ScanBarcode size={32} className="text-cyan-400 animate-pulse" />
                    <span className="font-bold text-sm text-slate-300">Lector Activo</span>
                </div>
            </header>

            {/* Main Content */}
            <main className="relative z-10 flex-1 flex flex-col items-center justify-start p-8 max-w-5xl mx-auto w-full">

                {/* Search Bar */}
                <div className="w-full relative mb-12">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={32} />
                    <input
                        type="text"
                        placeholder="¿Qué busca? (Ej: Paracetamol, Bago...)"
                        className="w-full pl-20 pr-6 py-8 bg-slate-800/80 border-2 border-slate-700 rounded-3xl text-3xl font-bold text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-4 focus:ring-cyan-500/20 transition-all shadow-2xl"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        autoFocus
                    />
                </div>

                {/* Search Results Grid */}
                {!selectedProduct && searchTerm && (
                    <div className="w-full grid grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4">
                        {filteredProducts.map(product => (
                            <div
                                key={product.id}
                                onClick={() => setSelectedProduct(product)}
                                className="bg-slate-800/60 border border-slate-700 p-6 rounded-2xl cursor-pointer hover:bg-slate-700/80 hover:border-cyan-500/50 transition-all group"
                            >
                                <h3 className="text-2xl font-bold text-slate-100 mb-2 group-hover:text-cyan-400">{product.name}</h3>
                                <p className="text-slate-400 text-lg mb-4">{product.dci} - {product.laboratory}</p>
                                <div className="flex justify-between items-end">
                                    <span className="text-3xl font-extrabold text-white">${product.price.toLocaleString()}</span>
                                    <span className="text-sm bg-slate-700 px-3 py-1 rounded-lg text-slate-300">Ver Detalle</span>
                                </div>
                            </div>
                        ))}
                        {filteredProducts.length === 0 && (
                            <div className="col-span-2 text-center py-12 text-slate-500">
                                <p className="text-xl">No se encontraron productos</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Idle State / Call to Action */}
                {!selectedProduct && !searchTerm && (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-50">
                        <ScanBarcode size={120} className="text-slate-600 mb-8" />
                        <p className="text-2xl font-bold text-slate-500">Acerque el código de barras al lector</p>
                    </div>
                )}
            </main>

            {/* Product Detail Modal (Full Screen) */}
            <AnimatePresence>
                {selectedProduct && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-xl flex items-center justify-center p-8"
                    >
                        <div className="bg-white text-slate-900 w-full max-w-4xl rounded-[3rem] overflow-hidden shadow-2xl relative">

                            {/* Close Button */}
                            <button
                                onClick={() => setSelectedProduct(null)}
                                className="absolute top-8 right-8 bg-slate-100 hover:bg-slate-200 p-4 rounded-full transition-colors z-10"
                            >
                                <X size={32} className="text-slate-600" />
                            </button>

                            <div className="flex flex-col md:flex-row h-full">
                                {/* Left: Main Info & Price */}
                                <div className="w-full md:w-5/12 bg-slate-50 p-12 flex flex-col justify-center items-center border-r border-slate-100 relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-cyan-500 to-blue-500" />

                                    <div className="mb-8 text-center">
                                        <span className="inline-block px-4 py-2 bg-slate-200 rounded-full text-sm font-bold text-slate-600 mb-4">
                                            {selectedProduct.sku}
                                        </span>
                                        <h2 className="text-3xl font-extrabold text-slate-800 leading-tight mb-2">
                                            {selectedProduct.name}
                                        </h2>
                                        <p className="text-xl text-slate-500 font-medium">
                                            {selectedProduct.format} x{selectedProduct.unit_count}
                                        </p>
                                    </div>

                                    <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 w-full text-center transform scale-110">
                                        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2">Precio Venta</p>
                                        <p className="text-6xl font-black text-slate-900 tracking-tight">
                                            ${selectedProduct.price.toLocaleString()}
                                        </p>
                                    </div>

                                    {/* Timer Indicator */}
                                    <div className="mt-12 flex items-center gap-2 text-slate-400 text-sm font-medium animate-pulse">
                                        <Clock size={16} />
                                        <span>Cerrando en 15s...</span>
                                    </div>
                                </div>

                                {/* Right: Technical Details (Seremi) */}
                                <div className="w-full md:w-7/12 p-12 bg-white">
                                    <h3 className="text-2xl font-bold text-slate-800 mb-8 flex items-center gap-3">
                                        <Info className="text-cyan-600" />
                                        Ficha Técnica
                                    </h3>

                                    <div className="space-y-6">
                                        <div className="grid grid-cols-2 gap-8">
                                            <div>
                                                <p className="text-sm font-bold text-slate-400 mb-1">Principio Activo (DCI)</p>
                                                <p className="text-xl font-bold text-slate-800">{selectedProduct.dci}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-slate-400 mb-1">Concentración</p>
                                                <p className="text-xl font-bold text-slate-800">{selectedProduct.concentration}</p>
                                            </div>
                                        </div>

                                        <div className="h-px bg-slate-100" />

                                        <div className="grid grid-cols-2 gap-8">
                                            <div>
                                                <p className="text-sm font-bold text-slate-400 mb-1">Laboratorio</p>
                                                <p className="text-lg font-bold text-slate-700">{selectedProduct.laboratory}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-slate-400 mb-1">Bioequivalencia</p>
                                                <span className={`inline-flex items-center px-3 py-1 rounded-lg text-sm font-bold ${selectedProduct.bioequivalent_status === 'BIOEQUIVALENTE' ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-500'}`}>
                                                    {selectedProduct.bioequivalent_status === 'BIOEQUIVALENTE' ? 'BIOEQUIVALENTE' : 'NO APLICA'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="h-px bg-slate-100" />

                                        <div className="grid grid-cols-2 gap-8">
                                            <div>
                                                <p className="text-sm font-bold text-slate-400 mb-1">Precio por Unidad</p>
                                                <p className="text-lg font-bold text-slate-700">
                                                    ${Math.round(calculatePricePerUnit(selectedProduct)).toLocaleString()} / un
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-slate-400 mb-1">Condición de Venta</p>
                                                <div className="flex items-center gap-2">
                                                    {selectedProduct.condition === 'VD' ? (
                                                        <span className="text-emerald-600 font-bold">Venta Directa</span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-purple-600 font-bold">
                                                            <AlertTriangle size={16} /> Receta {selectedProduct.condition}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-8">
                                        <h4 className="text-lg font-bold text-slate-800 mb-4">Alternativas Disponibles ({selectedProduct.dci})</h4>
                                        <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2">
                                            {alternatives.length > 0 ? (
                                                alternatives.map(alt => (
                                                    <div key={alt.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                                                        <div>
                                                            <p className="font-bold text-slate-700">{alt.name}</p>
                                                            <div className="flex gap-2 text-xs mt-1">
                                                                <span className="text-slate-500">{alt.laboratory}</span>
                                                                {alt.bioequivalent_status === 'BIOEQUIVALENTE' && (
                                                                    <span className="text-emerald-600 font-bold bg-emerald-50 px-2 rounded-full">BIO</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <p className="font-bold text-slate-900 text-lg">${alt.price.toLocaleString()}</p>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-slate-400 text-sm italic">No se encontraron otras alternativas disponibles.</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-8 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                        <p className="text-xs text-slate-400 text-center leading-relaxed">
                                            La información mostrada cumple con el Decreto Supremo 466.
                                            Consulte siempre a su Químico Farmacéutico. Visite ispch.cl
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PriceCheckPage;
