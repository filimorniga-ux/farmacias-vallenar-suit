import React, { useState } from 'react';
import { FileText, Stethoscope, CheckSquare, AlertTriangle } from 'lucide-react';

interface PrescriptionModalProps {
    isOpen: boolean;
    onConfirm: (data: { folio: string, doctorRut: string }) => void;
    onCancel: () => void;
    itemName: string;
}

const PrescriptionModal: React.FC<PrescriptionModalProps> = ({ isOpen, onConfirm, onCancel, itemName }) => {
    const [folio, setFolio] = useState('');
    const [doctorRut, setDoctorRut] = useState('');
    const [isArchived, setIsArchived] = useState(false);

    if (!isOpen) return null;

    const isValid = folio.length > 0 && doctorRut.length > 8 && isArchived;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="bg-amber-50 p-6 border-b border-amber-100">
                    <h3 className="text-xl font-bold text-amber-800 flex items-center gap-2">
                        <AlertTriangle className="text-amber-600" /> Receta Retenida
                    </h3>
                    <p className="text-sm text-amber-700 mt-1">
                        La venta de <strong>{itemName}</strong> requiere receta retenida.
                    </p>
                </div>

                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-2">
                            <FileText size={16} /> Folio Receta
                        </label>
                        <input
                            type="text"
                            className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-amber-500 focus:outline-none"
                            placeholder="Ej: A-123456"
                            value={folio}
                            onChange={(e) => setFolio(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-2">
                            <Stethoscope size={16} /> RUT Médico Prescriptor
                        </label>
                        <input
                            type="text"
                            className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-amber-500 focus:outline-none"
                            placeholder="Ej: 11.222.333-4"
                            value={doctorRut}
                            onChange={(e) => setDoctorRut(e.target.value)}
                        />
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${isArchived ? 'bg-amber-500 border-amber-500 text-white' : 'border-slate-300 bg-white'}`}>
                                {isArchived && <CheckSquare size={16} />}
                            </div>
                            <input
                                type="checkbox"
                                className="hidden"
                                checked={isArchived}
                                onChange={(e) => setIsArchived(e.target.checked)}
                            />
                            <span className="text-sm font-bold text-slate-700">Receta Física Archivada</span>
                        </label>
                        <p className="text-xs text-slate-400 mt-2 ml-9">
                            Declaro haber recibido y archivado la receta física correspondiente.
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 pt-4">
                        <div className="flex gap-3">
                            <button
                                onClick={onCancel}
                                className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => isValid && onConfirm({ folio, doctorRut })}
                                disabled={!isValid}
                                className="flex-1 py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-200"
                            >
                                Confirmar
                            </button>
                        </div>
                        <button
                            onClick={() => onConfirm({ folio: 'PENDIENTE_VALIDACION', doctorRut: 'VALIDACION_MANUAL' })}
                            className="w-full py-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition uppercase tracking-wider"
                        >
                            Omitir / Validar Manualmente
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PrescriptionModal;
