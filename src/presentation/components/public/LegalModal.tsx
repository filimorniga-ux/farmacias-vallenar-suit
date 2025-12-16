'use client';

import React from 'react';
import { X, ExternalLink, Scale, ScrollText, BookOpen, FileText } from 'lucide-react';

interface LegalModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const LEGAL_LINKS = [
    {
        title: 'Reglamento de Farmacias',
        subtitle: 'Decreto Supremo 466',
        url: 'https://www.bcn.cl/leychile/navegar?idNorma=13613',
        icon: ScrollText,
        color: 'bg-blue-50 text-blue-600'
    },
    {
        title: 'Reglamento Control de Productos',
        subtitle: 'Decreto Supremo 3',
        url: 'https://www.bcn.cl/leychile/navegar?idNorma=1010372',
        icon: Scale,
        color: 'bg-indigo-50 text-indigo-600'
    },
    {
        title: 'Farmacopea Chilena',
        subtitle: 'Instituto de Salud Pública (ISP)',
        url: 'https://www.ispch.cl/anamed/farmacopea-chilena/',
        icon: BookOpen,
        color: 'bg-emerald-50 text-emerald-600'
    },
    {
        title: 'Ley de Fármacos II',
        subtitle: 'Normativa Vigente',
        url: 'https://www.bcn.cl/leychile/navegar?idNorma=1058373',
        icon: FileText,
        color: 'bg-purple-50 text-purple-600'
    }
];

export const LegalModal: React.FC<LegalModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    const handleOpenLink = (url: string) => {
        window.open(url, '_blank');
    };

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="bg-slate-900 p-6 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3 text-white">
                        <Scale className="w-8 h-8 text-cyan-400" />
                        <div>
                            <h2 className="text-2xl font-bold">Marco Legal Vigente</h2>
                            <p className="text-cyan-200 text-sm">Documentación oficial y normativa sanitaria</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 p-2 rounded-full transition-colors"
                    >
                        <X size={32} />
                    </button>
                </div>

                {/* Content Grid */}
                <div className="p-8 bg-slate-50 overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {LEGAL_LINKS.map((link, idx) => {
                            const Icon = link.icon;
                            return (
                                <button
                                    key={idx}
                                    onClick={() => handleOpenLink(link.url)}
                                    className="bg-white p-6 rounded-2xl shadow-sm border-2 border-slate-100 hover:border-cyan-400 hover:shadow-lg transition-all text-left group flex items-start gap-4 active:scale-[0.98]"
                                >
                                    <div className={`p-4 rounded-xl ${link.color} group-hover:scale-110 transition-transform`}>
                                        <Icon size={32} />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-bold text-slate-800 group-hover:text-cyan-700 transition-colors mb-1">
                                            {link.title}
                                        </h3>
                                        <p className="text-slate-500 font-medium text-sm mb-3">
                                            {link.subtitle}
                                        </p>
                                        <div className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded group-hover:bg-cyan-50 group-hover:text-cyan-600 transition-colors">
                                            <ExternalLink size={12} />
                                            LEER DOCUMENTO
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-slate-100 p-6 text-center text-slate-400 text-sm border-t border-slate-200">
                    <p>Estos enlaces redirigen a fuentes oficiales del Gobierno de Chile y el ISP.</p>
                </div>
            </div>
        </div>
    );
};
