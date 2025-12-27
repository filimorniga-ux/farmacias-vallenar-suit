'use client';

import React, { useState, useEffect } from 'react';
import { X, FileText, Search, Loader2, ChevronRight, Scale, ExternalLink } from 'lucide-react';
import { getLegalDocumentsSecure, type LegalDocument } from '@/actions/legal-v2';

interface LegalModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function LegalModal({ isOpen, onClose }: LegalModalProps) {
    const [documents, setDocuments] = useState<LegalDocument[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

    useEffect(() => {
        if (isOpen) {
            setIsLoading(true);
            getLegalDocumentsSecure().then(res => {
                if (res.success && res.data) {
                    setDocuments(res.data);
                }
                setIsLoading(false);
            });
        }
    }, [isOpen]);

    const categories = [
        { id: 'ALL', label: 'Todos' },
        { id: 'SANITARY', label: 'Sanitario' },
        { id: 'REGULATORY', label: 'Regulatorio' },
        { id: 'CONTROLLED', label: 'Controlados' },
        { id: 'MEDICAL', label: 'Médico' },
        { id: 'LEGAL', label: 'Legal' },
        { id: 'CUSTOMER_SERVICE', label: 'Atención Cliente' }
    ];

    const filteredDocs = documents.filter(doc => {
        const matchesSearch = doc.title.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = selectedCategory === 'ALL' || doc.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="bg-slate-50 w-full max-w-5xl h-[80vh] rounded-3xl shadow-2xl flex overflow-hidden relative border border-white/10">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-20 bg-white/50 hover:bg-white p-2 rounded-full text-slate-800 transition-all shadow-sm"
                >
                    <X size={24} />
                </button>

                {/* Left Sidebar: Categories */}
                <div className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
                    <div className="p-6 border-b border-slate-100">
                        <div className="flex items-center gap-2 text-cyan-700 mb-1">
                            <Scale size={24} />
                            <h2 className="text-xl font-black tracking-tight">Normativa</h2>
                        </div>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Documentación Oficial</p>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {categories.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition-all flex justify-between items-center ${selectedCategory === cat.id
                                        ? 'bg-cyan-50 text-cyan-700 shadow-sm'
                                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                                    }`}
                            >
                                {cat.label}
                                {selectedCategory === cat.id && <ChevronRight size={16} />}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main Content: Document List */}
                <div className="flex-1 flex flex-col bg-slate-50 relative">
                    {/* Search Bar */}
                    <div className="p-6 bg-white border-b border-slate-200 shadow-sm z-10">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                            <input
                                type="text"
                                placeholder="Buscar decreto, ley o reglamento..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-12 pr-4 py-4 bg-slate-100 border-none rounded-2xl text-slate-800 font-bold placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-500 outline-none transition-all"
                            />
                        </div>
                    </div>

                    {/* Results */}
                    <div className="flex-1 overflow-y-auto p-6 md:p-8">
                        {isLoading ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                <Loader2 size={48} className="animate-spin mb-4 text-cyan-500" />
                                <p className="font-bold">Cargando biblioteca legal...</p>
                            </div>
                        ) : filteredDocs.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                <FileText size={64} className="mb-4" />
                                <p className="text-xl font-bold">No se encontraron documentos</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {filteredDocs.map(doc => (
                                    <a
                                        key={doc.id}
                                        href={`/legal/${doc.filename}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="bg-white p-5 rounded-2xl border border-slate-100 hover:border-cyan-300 hover:shadow-lg hover:shadow-cyan-100/50 transition-all group flex items-start gap-4"
                                    >
                                        <div className="bg-slate-100 p-3 rounded-xl group-hover:bg-cyan-50 transition-colors">
                                            <FileText size={24} className="text-slate-500 group-hover:text-cyan-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-bold text-slate-800 text-lg leading-tight mb-1 group-hover:text-cyan-700 transition-colors truncate w-full">
                                                {doc.title}
                                            </h3>
                                            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                                                <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-500">
                                                    {doc.category}
                                                </span>
                                                <span>•</span>
                                                <span>PDF</span>
                                            </div>
                                        </div>
                                        <ExternalLink size={18} className="text-slate-300 group-hover:text-cyan-500" />
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
