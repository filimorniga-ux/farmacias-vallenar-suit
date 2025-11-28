import React, { useState, useCallback } from 'react';
import { X, Upload, FileSpreadsheet, AlertTriangle, CheckCircle, Download, Loader2 } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { usePharmaStore } from '../../store/useStore';
import { InventoryBatch } from '../../../domain/types';
import { v4 as uuidv4 } from 'uuid';

interface BulkImportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface ImportedRow {
    sku: string;
    name: string;
    dci?: string;
    laboratory?: string;
    price_sell: number;
    cost_net: number;
    stock: number;
    lot_number: string;
    expiry_date: string; // DD/MM/YYYY
    location?: string;
    is_refrigerated?: string; // SI/NO
    isValid: boolean;
    errors: string[];
}

const BulkImportModal: React.FC<BulkImportModalProps> = ({ isOpen, onClose }) => {
    const { importInventory } = usePharmaStore();
    const [step, setStep] = useState<'UPLOAD' | 'PREVIEW'>('UPLOAD');
    const [importedData, setImportedData] = useState<ImportedRow[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (!file) return;

        setIsProcessing(true);
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                // Skip header row
                const rows = jsonData.slice(1) as any[][];

                const parsedRows: ImportedRow[] = rows.map((row, index) => {
                    const errors: string[] = [];
                    const sku = row[0]?.toString() || '';
                    const name = row[1]?.toString() || '';
                    const price_sell = parseFloat(row[4]) || 0;

                    if (!sku) errors.push('Falta SKU');
                    if (!name) errors.push('Falta Nombre');
                    if (price_sell <= 0) errors.push('Precio inválido');

                    return {
                        sku,
                        name,
                        dci: row[2]?.toString(),
                        laboratory: row[3]?.toString(),
                        price_sell,
                        cost_net: parseFloat(row[5]) || 0,
                        stock: parseInt(row[6]) || 0,
                        lot_number: row[7]?.toString() || 'S/L',
                        expiry_date: row[8]?.toString(),
                        location: row[9]?.toString(),
                        is_refrigerated: row[10]?.toString(),
                        isValid: errors.length === 0,
                        errors
                    };
                }).filter(r => r.sku || r.name); // Filter empty rows

                setImportedData(parsedRows);
                setStep('PREVIEW');
            } catch (error) {
                console.error(error);
                toast.error('Error al procesar el archivo Excel');
            } finally {
                setIsProcessing(false);
            }
        };

        reader.readAsArrayBuffer(file);
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'application/vnd.ms-excel': ['.xls']
        },
        maxFiles: 1
    });

    const handleDownloadTemplate = () => {
        const headers = [
            'SKU', 'Nombre', 'DCI', 'Laboratorio', 'Precio Venta', 'Costo Neto', 'Stock', 'Lote', 'Vencimiento (DD/MM/AAAA)', 'Ubicación', 'Es Refrigerado (SI/NO)'
        ];
        const example = [
            '780001', 'Paracetamol 500mg', 'Paracetamol', 'Mintlab', 1990, 500, 100, 'L-2024', '31/12/2025', 'ESTANTE-A', 'NO'
        ];

        const ws = XLSX.utils.aoa_to_sheet([headers, example]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
        XLSX.writeFile(wb, 'Formato_Vallenar.xlsx');
    };

    const handleImport = async () => {
        setIsProcessing(true);
        try {
            // Convert ImportedRow to InventoryBatch format
            const validRows = importedData.filter(r => r.isValid);

            if (validRows.length === 0) {
                toast.error('No hay datos válidos para importar');
                return;
            }

            const itemsToImport = validRows.map(row => {
                // Parse date DD/MM/YYYY to timestamp
                let expiry = Date.now() + 31536000000; // Default 1 year
                if (row.expiry_date) {
                    const parts = row.expiry_date.split('/');
                    if (parts.length === 3) {
                        expiry = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
                    }
                }

                return {
                    id: uuidv4(),
                    sku: row.sku,
                    name: row.name,
                    dci: row.dci,
                    laboratory: row.laboratory,
                    price_sell: row.price_sell,
                    cost_net: row.cost_net,
                    stock_actual: row.stock,
                    lot_number: row.lot_number,
                    expiry_date: expiry,
                    location_id: 'BODEGA_CENTRAL', // Default
                    is_refrigerated: row.is_refrigerated?.toUpperCase() === 'SI',
                    status: 'AVAILABLE'
                } as any; // Using any to bypass strict type check for now, assuming store handles mapping
            });

            await importInventory(itemsToImport);
            toast.success(`${itemsToImport.length} productos importados exitosamente`);
            onClose();
            setStep('UPLOAD');
            setImportedData([]);
        } catch (error) {
            console.error(error);
            toast.error('Error al guardar en la base de datos');
        } finally {
            setIsProcessing(false);
        }
    };

    if (!isOpen) return null;

    const validCount = importedData.filter(r => r.isValid).length;
    const errorCount = importedData.length - validCount;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <FileSpreadsheet className="text-green-600" />
                            Importación Masiva
                        </h2>
                        <p className="text-sm text-gray-500">Carga de inventario desde Excel</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden p-8">
                    {step === 'UPLOAD' ? (
                        <div className="h-full flex flex-col items-center justify-center gap-8">
                            <div className="text-center max-w-md">
                                <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600">
                                    <Upload size={32} />
                                </div>
                                <h3 className="text-xl font-bold text-gray-800 mb-2">Sube tu archivo Excel</h3>
                                <p className="text-gray-500 mb-6">
                                    Para asegurar una carga correcta, descargue nuestra plantilla oficial y copie sus datos en ella.
                                </p>
                                <button
                                    onClick={handleDownloadTemplate}
                                    className="px-6 py-3 bg-white border-2 border-green-500 text-green-600 font-bold rounded-xl hover:bg-green-50 transition-colors flex items-center gap-2 mx-auto"
                                >
                                    <Download size={20} />
                                    Descargar Plantilla Excel (.xlsx)
                                </button>
                            </div>

                            <div className="w-full max-w-2xl">
                                <div
                                    {...getRootProps()}
                                    className={`border-3 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${isDragActive
                                        ? 'border-green-500 bg-green-50'
                                        : 'border-gray-300 hover:border-green-400 hover:bg-gray-50'
                                        }`}
                                >
                                    <input {...getInputProps()} />
                                    {isProcessing ? (
                                        <div className="flex flex-col items-center gap-3 text-gray-500">
                                            <Loader2 className="animate-spin" size={32} />
                                            <p>Procesando archivo...</p>
                                        </div>
                                    ) : (
                                        <>
                                            <p className="font-bold text-gray-700 text-lg mb-2">
                                                Arrastra y suelta tu archivo aquí
                                            </p>
                                            <p className="text-gray-400 text-sm">o haz clic para seleccionar</p>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col">
                            <div className="flex gap-4 mb-6">
                                <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                                    <CheckCircle className="text-green-600" size={24} />
                                    <div>
                                        <p className="text-sm text-green-800 font-bold">Registros Válidos</p>
                                        <p className="text-2xl font-bold text-green-700">{validCount}</p>
                                    </div>
                                </div>
                                <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
                                    <AlertTriangle className="text-red-600" size={24} />
                                    <div>
                                        <p className="text-sm text-red-800 font-bold">Errores Encontrados</p>
                                        <p className="text-2xl font-bold text-red-700">{errorCount}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 overflow-auto border border-gray-200 rounded-xl">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-700 font-bold sticky top-0">
                                        <tr>
                                            <th className="p-3">Estado</th>
                                            <th className="p-3">SKU</th>
                                            <th className="p-3">Nombre</th>
                                            <th className="p-3">Precio</th>
                                            <th className="p-3">Stock</th>
                                            <th className="p-3">Lote</th>
                                            <th className="p-3">Vencimiento</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {importedData.slice(0, 100).map((row, i) => (
                                            <tr key={i} className={row.isValid ? 'hover:bg-gray-50' : 'bg-red-50 hover:bg-red-100'}>
                                                <td className="p-3">
                                                    {row.isValid ? (
                                                        <CheckCircle size={16} className="text-green-500" />
                                                    ) : (
                                                        <div className="group relative">
                                                            <AlertTriangle size={16} className="text-red-500 cursor-help" />
                                                            <div className="absolute left-6 top-0 bg-red-800 text-white text-xs p-2 rounded shadow-lg w-48 hidden group-hover:block z-10">
                                                                {row.errors.join(', ')}
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-3 font-mono">{row.sku}</td>
                                                <td className="p-3 font-bold text-gray-800">{row.name}</td>
                                                <td className="p-3">${row.price_sell.toLocaleString()}</td>
                                                <td className="p-3">{row.stock}</td>
                                                <td className="p-3">{row.lot_number}</td>
                                                <td className="p-3">{row.expiry_date}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {importedData.length > 100 && (
                                    <div className="p-4 text-center text-gray-500 text-sm bg-gray-50 border-t border-gray-200">
                                        Mostrando primeros 100 de {importedData.length} registros
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-between items-center">
                    {step === 'PREVIEW' ? (
                        <>
                            <button
                                onClick={() => {
                                    setStep('UPLOAD');
                                    setImportedData([]);
                                }}
                                className="px-6 py-3 text-gray-600 font-bold hover:bg-gray-200 rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={validCount === 0 || isProcessing}
                                className="px-8 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isProcessing ? <Loader2 className="animate-spin" /> : <Upload size={20} />}
                                Importar {validCount} Productos
                            </button>
                        </>
                    ) : (
                        <div />
                    )}
                </div>
            </div>
        </div>
    );
};

export default BulkImportModal;
