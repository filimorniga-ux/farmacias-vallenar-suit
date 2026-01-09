import React from 'react';
import { X, Download } from 'lucide-react';

interface SupplierFilePreviewModalProps {
    isOpen: boolean;
    title: string;
    fileName: string;
    fileMime: string;
    base64: string;
    onClose: () => void;
    onDownload: () => void;
}

const SupplierFilePreviewModal: React.FC<SupplierFilePreviewModalProps> = ({
    isOpen,
    title,
    fileName,
    fileMime,
    base64,
    onClose,
    onDownload
}) => {
    if (!isOpen) return null;

    const dataUrl = `data:${fileMime};base64,${base64}`;
    const isPdf = fileMime === 'application/pdf';
    const isImage = fileMime.startsWith('image/');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-4xl rounded-2xl bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">{title}</h3>
                        <p className="text-xs text-slate-500">{fileName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onDownload}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                        >
                            <Download size={16} /> Descargar
                        </button>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="max-h-[70vh] overflow-auto p-4">
                    {isPdf ? (
                        <iframe src={dataUrl} className="h-[70vh] w-full rounded-lg border border-slate-200" />
                    ) : isImage ? (
                        <img src={dataUrl} alt={fileName} className="mx-auto max-h-[70vh] rounded-lg border border-slate-200" />
                    ) : (
                        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-slate-600">
                            Vista previa no disponible para este tipo de archivo.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SupplierFilePreviewModal;
