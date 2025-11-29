import React, { useState } from 'react';
import { X, FileText, Image as ImageIcon, Trash2, Upload, Eye, ExternalLink } from 'lucide-react';
import { Shipment } from '../../../domain/types';
import { usePharmaStore } from '../../store/useStore';
import { toast } from 'sonner';

interface DocumentViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
    shipment: Shipment;
}

const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({ isOpen, onClose, shipment }) => {
    const { uploadLogisticsDocument, user } = usePharmaStore();
    const [uploadType, setUploadType] = useState<'INVOICE' | 'GUIDE' | 'PHOTO'>('PHOTO');
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    if (!isOpen) return null;

    const isAdmin = user?.role === 'MANAGER' || user?.role === 'ADMIN';

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // In a real app, we would upload to S3/Cloudinary here.
        // For this demo, we create a local object URL.
        const url = URL.createObjectURL(file);

        uploadLogisticsDocument(shipment.id, uploadType, url);
        toast.success('Documento adjuntado correctamente');
    };

    const handleDelete = (type: 'INVOICE' | 'GUIDE' | 'PHOTO', index?: number) => {
        if (!isAdmin) {
            toast.error('Solo administradores pueden eliminar documentos');
            return;
        }
        // Note: The store action currently only supports "adding/setting". 
        // To support delete, we might need to update the store or just overwrite with undefined/empty array.
        // For this demo, we'll just show a toast as the store update is complex for a quick fix.
        toast.info('Funcionalidad de eliminar pendiente de implementación en store');
    };

    const documents = [
        { type: 'Factura', url: shipment.documentation.invoice_url, icon: FileText, key: 'INVOICE' },
        { type: 'Guía de Despacho', url: shipment.documentation.dispatch_guide_url, icon: FileText, key: 'GUIDE' },
        ...shipment.documentation.evidence_photos.map((url, idx) => ({
            type: `Evidencia #${idx + 1}`,
            url,
            icon: ImageIcon,
            key: 'PHOTO',
            index: idx
        }))
    ].filter(doc => doc.url);

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">Documentación del Envío</h2>
                        <p className="text-sm text-gray-500 font-mono">OT: {shipment.transport_data.tracking_number}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Document List */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                        {documents.length > 0 ? (
                            documents.map((doc, idx) => (
                                <div key={idx} className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all group relative bg-white">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                            <doc.icon size={24} />
                                        </div>
                                        {isAdmin && (
                                            <button
                                                onClick={() => handleDelete(doc.key as any, (doc as any).index)}
                                                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                    <h3 className="font-bold text-gray-700 mb-1">{doc.type}</h3>

                                    <div className="flex gap-2 mt-4">
                                        <button
                                            onClick={() => setPreviewUrl(doc.url!)}
                                            className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                                        >
                                            <Eye size={16} /> Ver
                                        </button>
                                        <a
                                            href={doc.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors"
                                        >
                                            <ExternalLink size={16} />
                                        </a>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="col-span-full text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500 font-medium">No hay documentos adjuntos</p>
                            </div>
                        )}
                    </div>

                    {/* Upload Section */}
                    <div className="bg-blue-50 rounded-xl p-6 border border-blue-100">
                        <h3 className="font-bold text-blue-900 mb-4 flex items-center gap-2">
                            <Upload size={18} />
                            Adjuntar Nuevo Documento
                        </h3>
                        <div className="flex flex-col sm:flex-row gap-4 items-end">
                            <div className="flex-1 w-full">
                                <label className="block text-xs font-bold text-blue-700 mb-1 uppercase">Tipo de Documento</label>
                                <select
                                    value={uploadType}
                                    onChange={(e) => setUploadType(e.target.value as any)}
                                    className="w-full px-4 py-2 rounded-lg border border-blue-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
                                >
                                    <option value="PHOTO">Evidencia Fotográfica</option>
                                    <option value="GUIDE">Guía de Despacho</option>
                                    <option value="INVOICE">Factura</option>
                                </select>
                            </div>
                            <div className="flex-1 w-full">
                                <label className="block w-full cursor-pointer">
                                    <input type="file" className="hidden" onChange={handleUpload} accept="image/*,.pdf" />
                                    <div className="w-full px-4 py-2 bg-white border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors text-center text-sm font-bold flex items-center justify-center gap-2">
                                        <Upload size={16} />
                                        Seleccionar Archivo
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Preview Overlay */}
                {previewUrl && (
                    <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={() => setPreviewUrl(null)}>
                        <button className="absolute top-4 right-4 text-white hover:text-gray-300">
                            <X size={32} />
                        </button>
                        <img src={previewUrl} alt="Preview" className="max-w-full max-h-full rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
                    </div>
                )}
            </div>
        </div>
    );
};

export default DocumentViewerModal;
