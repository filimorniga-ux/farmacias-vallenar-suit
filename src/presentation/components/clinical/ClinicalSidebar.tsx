
import React from 'react';
import { AlertTriangle, Clock, RefreshCw, XCircle } from 'lucide-react';
import { ClinicalAnalysisResult } from '../../../domain/types';

interface ClinicalSidebarProps {
    analysis: ClinicalAnalysisResult | null;
    lastChecked: number;
}

const ClinicalSidebar: React.FC<ClinicalSidebarProps> = ({ analysis, lastChecked }) => {
    const statusColor = analysis?.status === 'BLOCK' ? 'bg-red-600' : analysis?.status === 'WARNING' ? 'bg-amber-500' : 'bg-emerald-600';

    return (
        <div className="w-full p-4 bg-slate-800 rounded-xl shadow-lg h-full flex flex-col">
            <h3 className="text-lg font-bold text-cyan-500 mb-4 flex items-center">
                <RefreshCw size={16} className="mr-2" /> Agente Clínico IA (Copilot)
            </h3>

            {/* Indicador de Estado */}
            <div className={`p-3 rounded-lg text-white ${statusColor} mb-4 flex items-start`}>
                {analysis?.status === 'BLOCK' && <XCircle size={20} className="mt-1 mr-3" />}
                {analysis?.status === 'WARNING' && <AlertTriangle size={20} className="mt-1 mr-3" />}
                <p className="text-sm font-semibold">{analysis?.message || 'Añade items para análisis en tiempo real.'}</p>
            </div>

            {/* Sugerencias */}
            {analysis?.suggestedItems && analysis.suggestedItems.length > 0 && (
                <div className="p-3 bg-slate-700 rounded-lg mt-auto">
                    <p className="text-xs text-cyan-300 font-semibold mb-1">Sugerencias (Cross-selling):</p>
                    <ul className="text-sm text-white">
                        {analysis.suggestedItems.map((item, index) => (
                            <li key={index} className="flex items-center">
                                • {item}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Footer de Trazabilidad */}
            <div className="mt-4 pt-3 border-t border-slate-700">
                <p className="text-xs text-slate-400 flex items-center">
                    <Clock size={12} className="mr-1" /> Último chequeo: {new Date(lastChecked).toLocaleTimeString('es-CL')}
                </p>
            </div>
        </div>
    );
};

export default ClinicalSidebar;
