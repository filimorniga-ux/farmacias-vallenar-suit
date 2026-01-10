
'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, CheckCircle, AlertTriangle, Loader2, ArrowRight } from 'lucide-react';
import { processInvoiceXML, InvoiceProcessResult } from '@/actions/procurement/process-invoice';

export default function InvoiceUploader() {
    const [isProcessing, setIsProcessing] = useState(false);
    const [result, setResult] = useState<InvoiceProcessResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (!file) return;

        if (file.type !== 'text/xml' && !file.name.endsWith('.xml')) {
            setError('Por favor sube un archivo XML válido (DTE).');
            return;
        }

        setIsProcessing(true);
        setResult(null);
        setError(null);

        try {
            const text = await file.text();
            const res = await processInvoiceXML(text);

            if (res.success) {
                setResult(res);
            } else {
                setError(res.message || 'Error al procesar la factura.');
            }
        } catch (err: any) {
            setError(err.message || 'Error desconocido al leer el archivo.');
        } finally {
            setIsProcessing(false);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'text/xml': ['.xml'] },
        multiple: false
    });

    return (
        <div className="space-y-8">
            {/* Upload Area */}
            <div
                {...getRootProps()}
                className={`
            border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer
            ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'}
        `}
            >
                <input {...getInputProps()} />
                {isProcessing ? (
                    <div className="flex flex-col items-center justify-center py-4">
                        <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-3" />
                        <p className="text-gray-600 font-medium">Procesando factura y analizando inventario...</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center">
                        <UploadCloud className="w-12 h-12 text-gray-400 mb-4" />
                        <p className="text-lg font-medium text-gray-700">Arrastra tu XML de Factura aquí</p>
                        <p className="text-sm text-gray-500 mt-1">o haz click para seleccionar archivo</p>
                    </div>
                )}
            </div>

            {/* Error Message */}
            {error && (
                <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                        <h4 className="font-bold text-sm">Error de Procesamiento</h4>
                        <p className="text-sm">{error}</p>
                    </div>
                </div>
            )}

            {/* Results Table */}
            {result && result.items && result.items.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-gray-800">Factura Procesada #{result.invoiceNumber}</h3>
                            <p className="text-sm text-gray-500">Proveedor RUT: {result.supplierRut}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-gray-500 uppercase">Monto Total</p>
                            <p className="font-bold text-lg">${result.totalAmount?.toLocaleString('es-CL')}</p>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-white border-b border-gray-200 text-gray-500">
                                <tr>
                                    <th className="px-6 py-3 font-medium">Item Factura</th>
                                    <th className="px-6 py-3 font-medium">Match Inventario</th>
                                    <th className="px-6 py-3 font-medium text-right">Cant.</th>
                                    <th className="px-6 py-3 font-medium text-right">Precio</th>
                                    <th className="px-6 py-3 font-medium">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {result.items.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-6 py-3 max-w-xs">
                                            <div className="font-medium text-gray-900 truncate" title={item.rawName}>
                                                {item.rawName}
                                            </div>
                                            <div className="text-xs text-gray-400">{item.rawCode}</div>
                                        </td>
                                        <td className="px-6 py-3 max-w-xs">
                                            {item.matchResult?.status === 'MATCHED' ? (
                                                <div className="flex flex-col">
                                                    <span className="text-emerald-700 font-medium text-xs bg-emerald-50 px-2 py-0.5 rounded w-fit mb-1">
                                                        ID: {item.matchResult.targetProductId}
                                                    </span>
                                                    {/* Ideally display local name if we fetched it, but action returns basic match data */}
                                                    <span className="text-xs text-gray-500">
                                                        {item.matchResult.suggestion?.source || 'Automatch'}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-amber-600 text-xs italic">
                                                    Sin vínculo automático
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-3 text-right font-mono">
                                            {item.qty}
                                            {item.updatedStock && (
                                                <div className="flex items-center justify-end gap-1 text-xs text-emerald-600 font-bold mt-1">
                                                    <ArrowRight className="w-3 h-3" />
                                                    {item.updatedStock}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-3 text-right font-mono">
                                            ${item.price.toLocaleString('es-CL')}
                                        </td>
                                        <td className="px-6 py-3">
                                            {item.matchResult?.status === 'MATCHED' ? (
                                                <div className="flex items-center text-emerald-600 text-xs font-bold bg-emerald-50 px-2 py-1 rounded-full w-fit">
                                                    <CheckCircle className="w-3 h-3 mr-1" />
                                                    ACTUALIZADO
                                                </div>
                                            ) : (
                                                <div className="flex items-center text-amber-600 text-xs font-bold bg-amber-50 px-2 py-1 rounded-full w-fit">
                                                    <AlertTriangle className="w-3 h-3 mr-1" />
                                                    REVISAR
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
