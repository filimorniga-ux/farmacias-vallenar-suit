import React, { useState } from 'react';
import { X, Upload, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';

interface SupplierCatalogUploadModalProps {
    isOpen: boolean;
    supplierId: string;
    onClose: () => void;
    onUploaded: () => void;
}

const SupplierCatalogUploadModal: React.FC<SupplierCatalogUploadModalProps> = ({
    isOpen,
    supplierId,
    onClose,
    onUploaded
}) => {
    const [file, setFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleUpload = async () => {
        if (!file) {
            toast.error('Selecciona un archivo');
            return;
        }
        setIsSubmitting(true);
        try {
            const reader = new FileReader();
            reader.onload = async () => {
                const base64 = reader.result as string;
                const { createSupplierCatalogFileSecure } = await import('@/actions/supplier-account-v2');
                const result = await createSupplierCatalogFileSecure({
                    supplierId,
                    fileName: file.name,
                    fileMime: file.type || 'application/octet-stream',
                    fileSize: file.size,
                    fileBase64: base64
                });
                if (result.success) {
                    toast.success('Catálogo cargado');
                    onUploaded();
                    onClose();
                } else {
                    toast.error(result.error || 'Error al guardar catálogo');
                }
            };
            reader.onerror = () => {
                toast.error('Error leyendo archivo');
            };
            reader.readAsDataURL(file);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                    <div className="flex items-center gap-2">
                        <FileSpreadsheet size={20} className="text-purple-600" />
                        <h3 className="text-lg font-bold text-slate-800">Subir Catálogo</h3>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={18} />
                    </button>
                </div>

                <div className="space-y-4 px-6 py-5">
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                        <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-slate-600">
                            <span>{file ? file.name : 'Subir PDF o Excel (.xlsx)'}</span>
                            <span className="flex items-center gap-1 text-purple-600 font-medium">
                                <Upload size={16} /> Elegir archivo
                            </span>
                            <input
                                type="file"
                                className="hidden"
                                accept="application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                onChange={(e) => setFile(e.target.files?.[0] || null)}
                            />
                        </label>
                    </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
                    <button
                        onClick={onClose}
                        className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleUpload}
                        disabled={isSubmitting}
                        className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                    >
                        {isSubmitting ? 'Subiendo...' : 'Guardar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SupplierCatalogUploadModal;
