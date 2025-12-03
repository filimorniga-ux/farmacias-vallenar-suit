import React, { useState } from 'react';
import { usePharmaStore } from '../../store/useStore';
import { Save, Star, Gift, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const LoyaltySettings: React.FC = () => {
    const { loyaltyConfig, updateLoyaltyConfig } = usePharmaStore();
    const [config, setConfig] = useState(loyaltyConfig);

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        updateLoyaltyConfig(config);
        toast.success('Reglas de fidelización actualizadas');
    };

    return (
        <div className="bg-white rounded-b-3xl shadow-sm border border-t-0 border-slate-200 overflow-hidden max-w-7xl p-8">
            <div className="flex items-start gap-6 mb-8">
                <div className="p-4 bg-amber-100 text-amber-600 rounded-2xl">
                    <Star size={32} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Reglas de Fidelización</h2>
                    <p className="text-slate-500">Configure cómo sus clientes acumulan y canjean puntos.</p>
                </div>
            </div>

            <form onSubmit={handleSave} className="max-w-2xl space-y-8">
                {/* Earn Rules */}
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Gift size={20} className="text-purple-600" />
                        Acumulación de Puntos
                    </h3>
                    <div className="grid grid-cols-1 gap-6">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                Monto de compra para ganar 1 punto
                            </label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                                <input
                                    type="number"
                                    min="1"
                                    className="w-full pl-8 pr-4 py-3 border-2 border-slate-300 rounded-xl focus:border-cyan-500 focus:outline-none font-bold text-lg"
                                    value={config.earn_rate}
                                    onChange={(e) => setConfig({ ...config, earn_rate: Number(e.target.value) })}
                                />
                            </div>
                            <p className="text-xs text-slate-500 mt-2">
                                Ejemplo: Si ingresa <strong>100</strong>, por cada $100 pesos de compra, el cliente gana 1 punto.
                                <br />
                                Una compra de $10.000 generará <strong>{Math.floor(10000 / (config.earn_rate || 1))} puntos</strong>.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Burn Rules */}
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Star size={20} className="text-amber-600" />
                        Canje de Puntos
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                Valor en pesos de 1 punto
                            </label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                                <input
                                    type="number"
                                    min="1"
                                    className="w-full pl-8 pr-4 py-3 border-2 border-slate-300 rounded-xl focus:border-cyan-500 focus:outline-none font-bold text-lg"
                                    value={config.burn_rate}
                                    onChange={(e) => setConfig({ ...config, burn_rate: Number(e.target.value) })}
                                />
                            </div>
                            <p className="text-xs text-slate-500 mt-2">
                                Si el cliente tiene 1.000 puntos, equivalen a <strong>${(1000 * (config.burn_rate || 0)).toLocaleString()}</strong> pesos.
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                Mínimo de puntos para canjear
                            </label>
                            <input
                                type="number"
                                min="0"
                                className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-cyan-500 focus:outline-none font-bold text-lg"
                                value={config.min_points_to_redeem}
                                onChange={(e) => setConfig({ ...config, min_points_to_redeem: Number(e.target.value) })}
                            />
                            <p className="text-xs text-slate-500 mt-2">
                                El cliente debe tener al menos esta cantidad para poder usar sus puntos.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4 p-4 bg-blue-50 text-blue-700 rounded-xl border border-blue-100">
                    <AlertCircle size={24} className="flex-shrink-0" />
                    <p className="text-sm">
                        Los cambios en estas reglas se aplicarán inmediatamente a todas las nuevas ventas y canjes.
                        El saldo de puntos de los clientes no se verá afectado, pero su valor en pesos cambiará según la nueva configuración.
                    </p>
                </div>

                <div className="flex justify-end">
                    <button
                        type="submit"
                        className="px-8 py-4 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-700 transition shadow-lg flex items-center gap-2"
                    >
                        <Save size={20} /> Guardar Reglas
                    </button>
                </div>
            </form>
        </div>
    );
};

export default LoyaltySettings;
