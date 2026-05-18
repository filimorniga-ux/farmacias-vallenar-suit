'use client';

import { useState, useEffect } from 'react';
import { Save, X, AlertCircle, Sparkles, Calculator, Info } from 'lucide-react';
import { toast } from 'sonner';

interface QuickProductCreateProps {
    defaultName: string;
    defaultCost: number; // This usually comes as Net or Total? Assuming Invoice Item Value (Net)
    onCancel: () => void;
    onCreated: (product: { id: string; name: string; sku: string }) => void;
}

export default function QuickProductCreate({
    defaultName,
    defaultCost,
    onCancel,
    onCreated
}: QuickProductCreateProps) {
    // Basic
    const [name, setName] = useState(defaultName);
    const [sku, setSku] = useState(`SKU-${Date.now().toString().slice(-6)}`);

    // Financials
    const [costNet, setCostNet] = useState(Math.round(defaultCost));
    const [taxPercent] = useState(19);
    // Suggest price: CostNet * 1.19 (IVA) * 1.4 (40% margin)
    const [price, setPrice] = useState(Math.round(defaultCost * 1.19 * 1.4));

    // Pharma / Extended
    const [dci, setDci] = useState('');
    const [laboratory, setLaboratory] = useState('');
    const [format, setFormat] = useState('');
    const [unitsPerBox, setUnitsPerBox] = useState(1);
    const [isBioequivalent, setIsBioequivalent] = useState(false);
    const [requiresPrescription, setRequiresPrescription] = useState(false);
    const [isColdChain, setIsColdChain] = useState(false);

    // UX
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isEnriching, setIsEnriching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPharma, setShowPharma] = useState(false);

    // Derived
    const costGross = Math.round(costNet * (1 + taxPercent / 100));
    const margin = price > 0 ? Math.round(((price - costGross) / price) * 100) : 0;
    const unitCost = costGross / (unitsPerBox || 1);

    const handleEnrichWithAI = async () => {
        setIsEnriching(true);
        try {
            const { enrichProductDataSecure } = await import('@/actions/products-ai-v2');
            const result = await enrichProductDataSecure(name);

            if (result.success && result.data) {
                const data = result.data;
                setDci(data.dci || '');
                setLaboratory(data.laboratory || '');
                setFormat(data.format || '');
                setIsBioequivalent(data.is_bioequivalent || false);
                setRequiresPrescription(data.requires_prescription || false);
                setIsColdChain(data.is_cold_chain || false);
                if (data.units_per_box) setUnitsPerBox(data.units_per_box);

                toast.success('Datos enriquecidos con IA');
                setShowPharma(true);
            } else {
                toast.error('No se pudo enriquecer el producto');
            }
        } catch (e) {
            toast.error('Error consultando IA');
            console.error(e);
        } finally {
            setIsEnriching(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            const { quickCreateProductSecure } = await import('@/actions/products-v2');

            // Ensure we send numbers, not strings from inputs
            const payload = {
                name,
                sku,
                costPrice: Number(costGross), // Sending Gross for legacy compatibility
                salePrice: Number(price),
                costNet: Number(costNet),
                dci,
                laboratory,
                format,
                unitsPerBox: Number(unitsPerBox),
                isBioequivalent,
                requiresPrescription,
                isColdChain
            };

            const result = await quickCreateProductSecure(payload);

            if (result.success && result.data) {
                toast.success('Producto creado y auditado');
                onCreated(result.data);
            } else {
                setError(result.error || 'Error al crear producto');
            }
        } catch (err: any) {
            setError(err.message || 'Error de conexión');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div
            data-testid="quick-product-create-panel"
            className="w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-purple-100 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-xl sm:p-6"
        >
            <div className="flex justify-between items-start mb-4">
                <div className="min-w-0 pr-3">
                    <h3 className="text-lg font-bold text-gray-900 text-pretty">Crear Nuevo Producto</h3>
                    <p className="text-xs text-gray-500">Desde Factura Inteligente</p>
                </div>
                <button
                    type="button"
                    onClick={onCancel}
                    aria-label="Cancelar creación rápida"
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                >
                    <X size={20} aria-hidden="true" />
                </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center gap-2 border border-red-100" aria-live="polite">
                        <AlertCircle size={16} aria-hidden="true" />
                        {error}
                    </div>
                )}

                {/* --- Identity --- */}
                <div className="space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <div className="flex-1">
                            <label htmlFor="quick-product-name" className="block text-xs font-semibold text-gray-700 mb-1">Nombre Comercial</label>
                            <input
                                id="quick-product-name"
                                name="quick-product-name"
                                type="text"
                                autoComplete="off"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full min-h-11 px-3 py-2 border border-gray-300 rounded-lg text-base sm:text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                                required
                            />
                        </div>
                        <button
                            type="button"
                            onClick={handleEnrichWithAI}
                            disabled={isEnriching || name.length < 3}
                            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-3 py-2 text-sm font-medium text-white transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 disabled:opacity-50 sm:w-auto"
                            title="Auto-completar datos con Inteligencia Artificial"
                        >
                            {isEnriching ? (
                                <span className="animate-spin" aria-hidden="true">✨</span>
                            ) : (
                                <Sparkles size={16} aria-hidden="true" />
                            )}
                            <span className="hidden sm:inline">IA Assistant</span>
                            <span className="sm:hidden">Completar con IA</span>
                        </button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <label htmlFor="quick-product-sku" className="block text-xs font-medium text-gray-600 mb-1">SKU</label>
                            <input
                                id="quick-product-sku"
                                name="quick-product-sku"
                                type="text"
                                autoComplete="off"
                                spellCheck={false}
                                value={sku}
                                onChange={(e) => setSku(e.target.value)}
                                className="w-full min-h-11 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-base font-mono text-gray-600 sm:text-sm"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="quick-product-cost-net" className="block text-xs font-medium text-gray-600 mb-1">Costo Neto (Factura)</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                                <input
                                    id="quick-product-cost-net"
                                    name="quick-product-cost-net"
                                    type="number"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    value={costNet}
                                    onChange={(e) => setCostNet(Number(e.target.value))}
                                    className="w-full min-h-11 pl-6 pr-3 py-2 border border-blue-200 bg-blue-50/30 rounded-lg text-base focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium text-blue-900 sm:text-sm"
                                    required
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- Financial Summary --- */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 rounded-lg border border-blue-100 grid grid-cols-1 gap-2 text-center shadow-sm sm:grid-cols-3">
                    <div>
                        <div className="text-[10px] text-blue-600 uppercase font-bold tracking-wider mb-0.5">Costo + IVA</div>
                        <div className="text-sm font-bold text-blue-900">${costGross.toLocaleString()}</div>
                    </div>
                    <div>
                        <div className="text-[10px] text-blue-600 uppercase font-bold tracking-wider mb-0.5">Margen</div>
                        <div className={`text-sm font-bold ${margin < 30 ? 'text-orange-600' : 'text-green-600'}`}>
                            {margin}%
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] text-blue-600 uppercase font-bold tracking-wider mb-0.5">Unitario</div>
                        <div className="text-sm font-bold text-blue-900">${Math.round(unitCost).toLocaleString()}</div>
                        <div className="text-[9px] text-blue-400 font-medium">({unitsPerBox} und/caja)</div>
                    </div>
                </div>

                {/* --- Sales --- */}
                <div>
                    <label htmlFor="quick-product-price" className="block text-sm font-semibold text-gray-900 mb-1">Precio de Venta (PVP)</label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                        <input
                            id="quick-product-price"
                            name="quick-product-price"
                            type="number"
                            inputMode="numeric"
                            autoComplete="off"
                            value={price}
                            onChange={(e) => setPrice(Number(e.target.value))}
                            className="w-full min-h-11 pl-7 pr-3 py-2.5 border-2 border-purple-100 rounded-lg text-lg font-bold text-purple-900 focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 focus:outline-none transition-colors"
                            required
                        />
                    </div>
                    <div className="flex justify-between items-center mt-1">
                        <p className="text-xs text-gray-500">Sugerido: Costo + 40%</p>
                    </div>
                </div>

                {/* --- Pharma Details Toggle --- */}
                <button
                    type="button"
                    onClick={() => setShowPharma(!showPharma)}
                    aria-expanded={showPharma}
                    className="w-full min-h-11 flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-100 transition-colors border border-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                >
                    <span className="flex min-w-0 items-center gap-2 text-left">
                        <Info size={14} className={showPharma ? "text-purple-600" : "text-gray-400"} aria-hidden="true" />
                        {showPharma ? "Ocultar Detalles Farmacéuticos" : "Mostrar Detalles Farmacéuticos (DCI, Lab, etc.)"}
                    </span>
                    <span className={`transition-transform duration-200 ${showPharma ? "rotate-180" : ""}`} aria-hidden="true">▼</span>
                </button>

                {showPharma && (
                    <div className="space-y-3 pt-2 animate-in slide-in-from-top-2 fade-in duration-200 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                                <label htmlFor="quick-product-dci" className="block text-xs font-medium text-gray-600 mb-1">Principio Activo (DCI)</label>
                                <input
                                    id="quick-product-dci"
                                    name="quick-product-dci"
                                    type="text"
                                    autoComplete="off"
                                    value={dci}
                                    onChange={(e) => setDci(e.target.value)}
                                    className="w-full min-h-11 px-3 py-2 border border-gray-200 rounded-lg text-base focus:ring-1 focus:ring-purple-500 focus:outline-none sm:text-xs"
                                    placeholder="Ej: Paracetamol"
                                />
                            </div>
                            <div>
                                <label htmlFor="quick-product-laboratory" className="block text-xs font-medium text-gray-600 mb-1">Laboratorio</label>
                                <input
                                    id="quick-product-laboratory"
                                    name="quick-product-laboratory"
                                    type="text"
                                    autoComplete="off"
                                    value={laboratory}
                                    onChange={(e) => setLaboratory(e.target.value)}
                                    className="w-full min-h-11 px-3 py-2 border border-gray-200 rounded-lg text-base focus:ring-1 focus:ring-purple-500 focus:outline-none sm:text-xs"
                                    placeholder="Ej: Chile"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                                <label htmlFor="quick-product-format" className="block text-xs font-medium text-gray-600 mb-1">Formato</label>
                                <input
                                    id="quick-product-format"
                                    name="quick-product-format"
                                    type="text"
                                    autoComplete="off"
                                    value={format}
                                    onChange={(e) => setFormat(e.target.value)}
                                    className="w-full min-h-11 px-3 py-2 border border-gray-200 rounded-lg text-base focus:ring-1 focus:ring-purple-500 focus:outline-none sm:text-xs"
                                    placeholder="Ej: Comprimidos"
                                />
                            </div>
                            <div>
                                <label htmlFor="quick-product-units-per-box" className="block text-xs font-medium text-gray-600 mb-1">Unidades por Caja</label>
                                <input
                                    id="quick-product-units-per-box"
                                    name="quick-product-units-per-box"
                                    type="number"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    value={unitsPerBox}
                                    onChange={(e) => setUnitsPerBox(Math.max(1, Number(e.target.value)))}
                                    className="w-full min-h-11 px-3 py-2 border border-gray-200 rounded-lg text-base focus:ring-1 focus:ring-purple-500 focus:outline-none sm:text-xs"
                                    min={1}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2">
                            <label className="flex min-h-11 items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded border border-gray-200 hover:border-purple-300 transition-colors">
                                <input
                                    type="checkbox"
                                    name="quick-product-bioequivalent"
                                    checked={isBioequivalent}
                                    onChange={(e) => setIsBioequivalent(e.target.checked)}
                                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 border-gray-300"
                                />
                                <span className="text-xs text-gray-700 font-medium">Bioequivalente 🟡</span>
                            </label>

                            <label className="flex min-h-11 items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded border border-gray-200 hover:border-purple-300 transition-colors">
                                <input
                                    type="checkbox"
                                    name="quick-product-prescription"
                                    checked={requiresPrescription}
                                    onChange={(e) => setRequiresPrescription(e.target.checked)}
                                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 border-gray-300"
                                />
                                <span className="text-xs text-gray-700">Receta Médica 🩺</span>
                            </label>

                            <label className="flex min-h-11 items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded border border-gray-200 hover:border-blue-300 transition-colors">
                                <input
                                    type="checkbox"
                                    name="quick-product-cold-chain"
                                    checked={isColdChain}
                                    onChange={(e) => setIsColdChain(e.target.checked)}
                                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
                                />
                                <span className="text-xs text-blue-700 font-medium">Refrigerado ❄️</span>
                            </label>
                        </div>
                    </div>
                )}

                <div className="flex flex-col-reverse justify-end gap-3 pt-4 border-t border-gray-100 sm:flex-row">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="min-h-11 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                        disabled={isSubmitting}
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="min-h-11 px-6 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
                    >
                        {isSubmitting ? (
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                        ) : (
                            <Save size={16} aria-hidden="true" />
                        )}
                        Crear Producto
                    </button>
                </div>
            </form>
        </div>
    );
}
