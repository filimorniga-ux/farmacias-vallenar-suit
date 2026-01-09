import React, { useState } from 'react';
import { X, Upload, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface SupplierAccountUploadModalProps {
    isOpen: boolean;
    supplierId: string;
    onClose: () => void;
    onUploaded: () => void;
}

const SupplierAccountUploadModal: React.FC<SupplierAccountUploadModalProps> = ({
    isOpen,
    supplierId,
    onClose,
    onUploaded
}) => {
    const [docType, setDocType] = useState<'FACTURA' | 'NOTA_CREDITO'>('FACTURA');
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [issueDate, setIssueDate] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [amount, setAmount] = useState('');
    const [status, setStatus] = useState<'PENDING' | 'PAID' | 'CANCELLED'>('PENDING');
    const [file, setFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleUpload = async () => {
        if (!invoiceNumber.trim() || !file) {
            toast.error('Completa número de factura y archivo');
            return;
        }
        setIsSubmitting(true);
        try {
            const reader = new FileReader();
            reader.onload = async () => {
                const base64 = reader.result as string;
                const { createSupplierAccountDocumentSecure } = await import('@/actions/supplier-account-v2');
                const result = await createSupplierAccountDocumentSecure({
                    supplierId,
                    type: docType,
                    invoiceNumber,
                    issueDate: issueDate || undefined,
                    dueDate: dueDate || undefined,
                    amount: amount ? Number(amount) : undefined,
                    status,
                    fileName: file.name,
                    fileMime: file.type || 'application/octet-stream',
                    fileSize: file.size,
                    fileBase64: base64
                });
                if (result.success) {
                    toast.success('Documento cargado');
                    onUploaded();
                    onClose();
                } else {
                    toast.error(result.error || 'Error al guardar documento');
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
            <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                    <div className="flex items-center gap-2">
                        <FileText size={20} className="text-blue-600" />
                        <h3 className="text-lg font-bold text-slate-800">Nueva Factura / NC</h3>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={18} />
                    </button>
                </div>

                <div className="space-y-4 px-6 py-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase">Tipo</label>
                            <select
                                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                value={docType}
                                onChange={(e) => setDocType(e.target.value as any)}
                            >
                                <option value="FACTURA">Factura</option>
                                <option value="NOTA_CREDITO">Nota de Crédito</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase">N° Factura</label>
                            <input
                                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                value={invoiceNumber}
                                onChange={(e) => setInvoiceNumber(e.target.value)}
                                placeholder="Ej: 12345"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase">Fecha Emisión</label>
                            <input
                                type="date"
                                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                value={issueDate}
                                onChange={(e) => setIssueDate(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase">Vencimiento</label>
                            <input
                                type="date"
                                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase">Monto</label>
                            <input
                                type="number"
                                min="0"
                                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase">Estado</label>
                            <select
                                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                value={status}
                                onChange={(e) => setStatus(e.target.value as any)}
                            >
                                <option value="PENDING">Pendiente</option>
                                <option value="PAID">Pagada</option>
                                <option value="CANCELLED">Anulada</option>
                            </select>
                        </div>
                    </div>

                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                        <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-slate-600">
                            <span>{file ? file.name : 'Subir PDF o Imagen'}</span>
                            <span className="flex items-center gap-1 text-blue-600 font-medium">
                                <Upload size={16} /> Elegir archivo
                            </span>
                            <input
                                type="file"
                                className="hidden"
                                accept="image/*,application/pdf"
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
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        {isSubmitting ? 'Subiendo...' : 'Guardar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SupplierAccountUploadModal;
