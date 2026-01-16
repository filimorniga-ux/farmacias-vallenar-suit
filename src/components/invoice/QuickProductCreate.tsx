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
        <div className="bg-white p-6 rounded-2xl shadow-xl border border-purple-100 w-[500px] max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-lg font-bold text-gray-900">Crear Nuevo Producto</h3>
                    <p className="text-xs text-gray-500">Desde Factura Inteligente</p>
                </div>
                <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
                    <X size={20} />
                </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center gap-2 border border-red-100">
                        <AlertCircle size={16} />
                        {error}
                    </div>
                )}

                {/* --- Identity --- */}
                <div className="space-y-3">
                    <div className="flex gap-2 items-end">
                        <div className="flex-1">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Nombre Comercial</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                required
                            />
                        </div>
                        <button
                            type="button"
                            onClick={handleEnrichWithAI}
                            disabled={isEnriching || name.length < 3}
                            className="px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:shadow-lg disabled:opacity-50 transition-all flex items-center gap-2 text-sm font-medium"
                            title="Auto-completar datos con Inteligencia Artificial"
                        >
                            {isEnriching ? (
                                <span className="animate-spin">✨</span>
                            ) : (
                                <Sparkles size={16} />
                            )}
                            <span className="hidden sm:inline">IA Assistant</span>
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">SKU</label>
                            <input
                                type="text"
                                value={sku}
                                onChange={(e) => setSku(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono text-gray-600"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Costo Neto (Factura)</label>
                            <div className="relative">
                                <span className="absolute left-3 top-2 text-gray-400">$</span>
                                <input
                                    type="number"
                                    value={costNet}
                                    onChange={(e) => setCostNet(Number(e.target.value))}
                                    className="w-full pl-6 pr-3 py-2 border border-blue-200 bg-blue-50/30 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none font-medium text-blue-900"
                                    required
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- Financial Summary --- */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 rounded-lg border border-blue-100 grid grid-cols-3 gap-2 text-center shadow-sm">
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
                    <label className="block text-sm font-semibold text-gray-900 mb-1">Precio de Venta (PVP)</label>
                    <div className="relative">
                        <span className="absolute left-3 top-2.5 text-gray-400">$</span>
                        <input
                            type="number"
                            value={price}
                            onChange={(e) => setPrice(Number(e.target.value))}
                            className="w-full pl-7 pr-3 py-2.5 border-2 border-purple-100 rounded-lg text-lg font-bold text-purple-900 focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 outline-none transition-all"
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
                    className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-100 transition-colors border border-gray-200"
                >
                    <span className="flex items-center gap-2">
                        <Info size={14} className={showPharma ? "text-purple-600" : "text-gray-400"} />
                        {showPharma ? "Ocultar Detalles Farmacéuticos" : "Mostrar Detalles Farmacéuticos (DCI, Lab, etc.)"}
                    </span>
                    <span className={`transition-transform duration-200 ${showPharma ? "rotate-180" : ""}`}>▼</span>
                </button>

                {showPharma && (
                    <div className="space-y-3 pt-2 animate-in slide-in-from-top-2 fade-in duration-200 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Principio Activo (DCI)</label>
                                <input
                                    type="text"
                                    value={dci}
                                    onChange={(e) => setDci(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-purple-500 outline-none"
                                    placeholder="Ej: Paracetamol"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Laboratorio</label>
                                <input
                                    type="text"
                                    value={laboratory}
                                    onChange={(e) => setLaboratory(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-purple-500 outline-none"
                                    placeholder="Ej: Chile"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Formato</label>
                                <input
                                    type="text"
                                    value={format}
                                    onChange={(e) => setFormat(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-purple-500 outline-none"
                                    placeholder="Ej: Comprimidos"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Unidades por Caja</label>
                                <input
                                    type="number"
                                    value={unitsPerBox}
                                    onChange={(e) => setUnitsPerBox(Math.max(1, Number(e.target.value)))}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-purple-500 outline-none"
                                    min={1}
                                />
                            </div>
                        </div>

                        <div className="flex gap-4 pt-2 flex-wrap">
                            <label className="flex items-center gap-2 cursor-pointer bg-white px-2 py-1 rounded border border-gray-200 hover:border-purple-300 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={isBioequivalent}
                                    onChange={(e) => setIsBioequivalent(e.target.checked)}
                                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 border-gray-300"
                                />
                                <span className="text-xs text-gray-700 font-medium">Bioequivalente 🟡</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer bg-white px-2 py-1 rounded border border-gray-200 hover:border-purple-300 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={requiresPrescription}
                                    onChange={(e) => setRequiresPrescription(e.target.checked)}
                                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 border-gray-300"
                                />
                                <span className="text-xs text-gray-700">Receta Médica 🩺</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer bg-white px-2 py-1 rounded border border-gray-200 hover:border-blue-300 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={isColdChain}
                                    onChange={(e) => setIsColdChain(e.target.checked)}
                                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
                                />
                                <span className="text-xs text-blue-700 font-medium">Refrigerado ❄️</span>
                            </label>
                        </div>
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        disabled={isSubmitting}
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-6 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
                    >
                        {isSubmitting ? (
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Save size={16} />
                        )}
                        Crear Producto
                    </button>
                </div>
            </form>
        </div>
    );
}
