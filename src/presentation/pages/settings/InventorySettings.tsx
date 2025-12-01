import React, { useState } from 'react';
import { Trash2, RotateCcw, AlertTriangle, Search, CheckCircle, AlertOctagon } from 'lucide-react';
import { toast } from 'sonner';

const InventorySettings: React.FC = () => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmation, setDeleteConfirmation] = useState('');
    const [duplicates, setDuplicates] = useState<any[]>([]);

    const executeAction = async (action: string, payload: any = {}) => {
        setIsProcessing(true);
        try {
            const res = await fetch('/api/inventory/maintenance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, ...payload })
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.details || data.error);

            if (action === 'ANALYZE_DUPLICATES') {
                setDuplicates(data.duplicates);
                if (data.duplicates.length === 0) {
                    toast.success('No se encontraron duplicados.');
                } else {
                    toast.info(`Se encontraron ${data.duplicates.length} grupos de duplicados.`);
                }
            } else {
                toast.success(data.message);
                setShowDeleteModal(false);
                setDeleteConfirmation('');
            }

        } catch (error) {
            console.error(error);
            toast.error('Error al ejecutar acción', {
                description: (error as Error).message
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleTruncate = () => {
        if (deleteConfirmation !== 'BORRAR') {
            toast.error('Debe escribir BORRAR para confirmar.');
            return;
        }
        executeAction('TRUNCATE', { confirmation: 'BORRAR' });
    };

    return (
        <div className="bg-white rounded-b-3xl shadow-sm border border-t-0 border-slate-200 overflow-hidden max-w-7xl p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                {/* DANGER ZONE */}
                <div className="border border-red-200 bg-red-50 rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-4 text-red-700">
                        <AlertOctagon size={28} />
                        <h3 className="text-xl font-bold">Zona de Peligro</h3>
                    </div>
                    <p className="text-red-600 mb-6 text-sm">
                        Estas acciones son destructivas e irreversibles. Úselas con extrema precaución.
                    </p>

                    <button
                        onClick={() => setShowDeleteModal(true)}
                        className="w-full py-4 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition shadow-lg flex items-center justify-center gap-2"
                    >
                        <Trash2 size={20} />
                        VACIAR TODO EL INVENTARIO
                    </button>
                </div>

                {/* UTILITIES */}
                <div className="space-y-6">
                    {/* Undo Import */}
                    <div className="border border-slate-200 bg-slate-50 rounded-2xl p-6">
                        <div className="flex items-center gap-3 mb-2 text-slate-700">
                            <RotateCcw size={24} />
                            <h3 className="text-lg font-bold">Revertir Última Carga</h3>
                        </div>
                        <p className="text-slate-500 text-sm mb-4">
                            Elimina productos creados en los últimos 10 minutos. Útil si una carga masiva salió mal.
                        </p>
                        <button
                            onClick={() => executeAction('UNDO_IMPORT')}
                            disabled={isProcessing}
                            className="px-6 py-2 bg-white border border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-100 transition w-full"
                        >
                            {isProcessing ? 'Procesando...' : 'Deshacer Importación Reciente'}
                        </button>
                    </div>

                    {/* Duplicates */}
                    <div className="border border-slate-200 bg-slate-50 rounded-2xl p-6">
                        <div className="flex items-center gap-3 mb-2 text-slate-700">
                            <Search size={24} />
                            <h3 className="text-lg font-bold">Buscar Duplicados</h3>
                        </div>
                        <p className="text-slate-500 text-sm mb-4">
                            Analiza la base de datos buscando productos con el mismo nombre.
                        </p>
                        <button
                            onClick={() => executeAction('ANALYZE_DUPLICATES')}
                            disabled={isProcessing}
                            className="px-6 py-2 bg-cyan-600 text-white font-bold rounded-lg hover:bg-cyan-700 transition w-full"
                        >
                            {isProcessing ? 'Analizando...' : 'Analizar Duplicados'}
                        </button>

                        {duplicates.length > 0 && (
                            <div className="mt-4 bg-white p-4 rounded-lg border border-slate-200 max-h-40 overflow-y-auto">
                                <h4 className="font-bold text-xs text-slate-500 mb-2">RESULTADOS ({duplicates.length})</h4>
                                <ul className="space-y-2">
                                    {duplicates.map((d, i) => (
                                        <li key={i} className="text-xs flex justify-between">
                                            <span className="font-medium text-slate-700">{d.name}</span>
                                            <span className="bg-orange-100 text-orange-700 px-2 rounded-full">{d.count}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* DELETE CONFIRMATION MODAL */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
                        <div className="flex flex-col items-center text-center mb-6">
                            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4 text-red-600">
                                <AlertTriangle size={32} />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900">¿Estás absolutamente seguro?</h3>
                            <p className="text-gray-500 mt-2">
                                Esta acción eliminará <strong>TODOS</strong> los productos del inventario. No se puede deshacer.
                            </p>
                        </div>

                        <div className="mb-6">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">
                                Escribe "BORRAR" para confirmar
                            </label>
                            <input
                                type="text"
                                value={deleteConfirmation}
                                onChange={(e) => setDeleteConfirmation(e.target.value)}
                                className="w-full p-3 border-2 border-red-200 rounded-xl focus:border-red-600 focus:outline-none font-bold text-center uppercase tracking-widest"
                                placeholder="BORRAR"
                                autoFocus
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowDeleteModal(false);
                                    setDeleteConfirmation('');
                                }}
                                className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleTruncate}
                                disabled={deleteConfirmation !== 'BORRAR' || isProcessing}
                                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-200"
                            >
                                {isProcessing ? 'Borrando...' : 'Confirmar Borrado'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InventorySettings;
