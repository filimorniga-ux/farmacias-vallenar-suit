
import React, { useState, useEffect } from 'react';
import { Truck, Sparkles, TrendingUp, AlertTriangle, ArrowRight, Loader } from 'lucide-react';
import { generateRestockSuggestionSecure } from '@/actions/procurement-v2';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { usePharmaStore } from '../../store/useStore';

interface SuggestionStats {
    totalItems: number;
    criticalItems: number;
    estimatedCost: number;
    isLoading: boolean;
}

export const AutoOrderWidget: React.FC = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState<SuggestionStats>({
        totalItems: 0,
        criticalItems: 0,
        estimatedCost: 0,
        isLoading: true
    });

    const loadSuggestions = async () => {
        try {
            const { currentLocationId } = usePharmaStore.getState();
            // Analizar para la sucursal actual (o Santiago como fallback histórico)
            const targetLocId = currentLocationId || 'bd7ddf7a-fac6-42f5-897d-bae8dfb3adf6';

            const result = await generateRestockSuggestionSecure(undefined, 15, 30, targetLocId);

            if (result.success && result.data) {
                const suggestions = result.data.filter((item: any) => item.suggested_quantity > 0);
                const critical = suggestions.filter((item: any) => item.days_until_stockout <= 5).length;
                const cost = suggestions.reduce((sum: number, item: any) => sum + (item.total_estimated || 0), 0);

                setStats({
                    totalItems: suggestions.length,
                    criticalItems: critical,
                    estimatedCost: cost,
                    isLoading: false
                });
            } else {
                setStats(prev => ({ ...prev, isLoading: false }));
            }
        } catch (error) {
            console.error('Error loading suggestions:', error);
            setStats(prev => ({ ...prev, isLoading: false }));
        }
    };

    useEffect(() => {
        loadSuggestions();
    }, [usePharmaStore.getState().currentLocationId]);

    if (stats.isLoading) {
        return (
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-center items-center h-48 animate-pulse">
                <Loader className="text-purple-500 animate-spin mb-3" size={24} />
                <p className="text-sm text-slate-400">Analizando demanda...</p>
            </div>
        );
    }

    if (stats.totalItems === 0) {
        return (
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-center items-center h-48 bg-gradient-to-br from-slate-50 to-white">
                <div className="bg-green-100 p-3 rounded-full mb-3 text-green-600">
                    <CheckCircle size={24} />
                </div>
                <p className="font-bold text-slate-700">Stock Saludable</p>
                <p className="text-xs text-slate-400 text-center mt-1">
                    La IA no detecta necesidades urgentes de reposición.
                </p>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-100 rounded-full blur-3xl -mr-16 -mt-16 opacity-50 group-hover:opacity-100 transition-opacity"></div>

            <div className="flex justify-between items-start mb-6 relative z-10">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <div className="p-1.5 bg-purple-100 text-purple-600 rounded-lg">
                            <Sparkles size={16} />
                        </div>
                        <h3 className="font-bold text-slate-800">Pedido Sugerido AI</h3>
                    </div>
                    <p className="text-xs text-slate-500">Basado en predicción de demanda 14d</p>
                </div>
                {stats.criticalItems > 0 && (
                    <span className="flex items-center gap-1 text-[10px] font-bold bg-red-100 text-red-600 px-2 py-1 rounded-full animate-pulse">
                        <AlertTriangle size={12} />
                        {stats.criticalItems} Críticos
                    </span>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6 relative z-10">
                <div className="bg-slate-50 p-3 rounded-2xl">
                    <p className="text-xs text-slate-400 mb-1">Sugerencias</p>
                    <p className="text-2xl font-extrabold text-slate-800">{stats.totalItems}</p>
                    <p className="text-[10px] text-purple-600 font-bold flex items-center">
                        Prod. a reponer
                    </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl">
                    <p className="text-xs text-slate-400 mb-1">Inversión Est.</p>
                    <p className="text-lg font-extrabold text-slate-800">
                        {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', notation: 'compact' }).format(stats.estimatedCost)}
                    </p>
                    <p className="text-[10px] text-emerald-600 font-bold flex items-center">
                        <TrendingUp size={10} className="mr-1" /> ROI optimizado
                    </p>
                </div>
            </div>

            <button
                onClick={() => navigate('/supply-chain')}
                className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-800 transition shadow-lg shadow-slate-200 relative z-10"
            >
                <Truck size={16} />
                Revisar Sugerencias
                <ArrowRight size={16} className="opacity-70 group-hover:translate-x-1 transition-transform" />
            </button>
        </div>
    );
};

// Icon import helper if needed
import { CheckCircle } from 'lucide-react';
