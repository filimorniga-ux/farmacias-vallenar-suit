import React, { useState, useCallback } from 'react';
import { X, Upload, FileSpreadsheet, AlertTriangle, CheckCircle, Download, Loader2, FileType, Edit2, Save } from 'lucide-react';
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
    id: string; // Internal ID for editing
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
    needs_review?: boolean;
}

type ImportFormat = 'OFFICIAL' | 'LEGACY';

const BulkImportModal: React.FC<BulkImportModalProps> = ({ isOpen, onClose }) => {
    const { importInventory } = usePharmaStore();
    const [step, setStep] = useState<'UPLOAD' | 'PREVIEW'>('UPLOAD');
    const [importedData, setImportedData] = useState<ImportedRow[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [importFormat, setImportFormat] = useState<ImportFormat>('OFFICIAL');

    // --- Parsing Logic ---

    const parseOfficialRow = (row: any[]): ImportedRow => {
        const errors: string[] = [];
        const sku = row[0]?.toString() || '';
        const name = row[1]?.toString() || '';
        const price_sell = parseFloat(row[4]) || 0;

        if (!sku) errors.push('Falta SKU');
        if (!name) errors.push('Falta Nombre');
        if (price_sell <= 0) errors.push('Precio inválido');

        return {
            id: uuidv4(),
            sku,
            name,
            dci: row[2]?.toString(),
            laboratory: row[3]?.toString(),
            price_sell,
            cost_net: parseFloat(row[5]) || 0,
            stock: parseInt(row[6]) || 0,
            lot_number: row[7]?.toString() || 'S/L',
            expiry_date: row[8]?.toString() || '',
            location: row[9]?.toString(),
            is_refrigerated: row[10]?.toString(),
            isValid: errors.length === 0,
            errors,
            needs_review: false
        };
    };

    const parseLegacyRow = (row: any[], index: number): ImportedRow => {
        const errors: string[] = [];

        // MAPPING BASED ON "FORMATO F1"
        // Col 0: Código Barras (SKU)
        // Col 1: Stock
        // Col 2: Precio Venta
        // Col 3: Costo Neto Prom. Unitario
        // Col 4: Grupo de Producto
        // Col 5: Producto (Nombre Completo)

        // NOTE: The user prompt had conflicting info on column order in two sections. 
        // "LÓGICA DE PARSEO" listed them in one way, "UI" hint in another.
        // I will implement a robust check or assume the "UI" hint order as it's more visual, 
        // BUT I will also check if the row has data in expected places.

        // Let's try to detect if it's the "UI" hint order (SKU, Name, Stock, Price, Cost) 
        // or the "Logic" order (SKU, Stock, Price, Cost, Group, Name).
        // Usually "Producto" is a text string. "Stock", "Price", "Cost" are numbers.

        // Heuristic: Check if Col 1 is a number (Stock) or String (Name)
        let sku = row[0]?.toString() || '';
        let rawName = '';
        let stock = 0;
        let price_sell = 0;
        let cost_net = 0;
        let group = '';

        const col1 = row[1];
        const isCol1Number = !isNaN(parseFloat(col1)) && isFinite(col1);

        if (isCol1Number) {
            // LOGIC ORDER: SKU, Stock, Price, Cost, Group, Name
            stock = parseInt(row[1]) || 0;
            price_sell = parseFloat(row[2]) || 0;
            cost_net = parseFloat(row[3]) || 0;
            group = row[4]?.toString() || '';
            rawName = row[5]?.toString() || '';
        } else {
            // UI HINT ORDER: SKU, Name, Stock, Price, Cost
            // Assuming Group might be Col 5
            rawName = row[1]?.toString() || '';
            stock = parseInt(row[2]) || 0;
            price_sell = parseFloat(row[3]) || 0;
            cost_net = parseFloat(row[4]) || 0;
            group = row[5]?.toString() || '';
        }

        // 1. SKU Generation
        if (!sku) {
            sku = `SKU-GEN-${index + 1}`;
            errors.push('SKU Generado Automáticamente');
        }

        if (!rawName) errors.push('Falta Nombre');

        // 2. Intelligent Parsing: "NOMBRE + DCI + LAB"
        let name = rawName;
        let laboratory = 'GENERICO';

        // Regex to find "LAB " or "LAB." and extract what follows
        // Example: "AMOXICILINA 500MG LAB CHILE" -> Name: "AMOXICILINA 500MG", Lab: "CHILE"
        const labRegex = /(.*?)\s+(?:LAB|LABORATORIO|LAB\.)\s+(.*)/i;
        const match = rawName.match(labRegex);

        if (match) {
            name = match[1].trim();
            laboratory = match[2].trim();
        }

        // 3. Defaults & Inferences
        const lot_number = 'SIN-LOTE-MIGRACION';
        const expiry_date = '31/12/2025'; // Default future date

        let category = 'MEDICAMENTO';
        if (group.toUpperCase().includes('NATURAL') || group.toUpperCase().includes('SUPLEMENTO')) {
            category = 'SUPLEMENTO';
        }

        return {
            id: uuidv4(),
            sku,
            name,
            dci: name, // Default DCI to Name
            laboratory,
            price_sell,
            cost_net,
            stock,
            lot_number,
            expiry_date,
            location: group || 'BODEGA_CENTRAL',
            is_refrigerated: 'NO',
            isValid: errors.length === 0 || (errors.length === 1 && errors[0].includes('SKU')), // Valid even if SKU generated
            errors,
            needs_review: true // Always flag for review
        };
    };

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
                    return importFormat === 'OFFICIAL'
                        ? parseOfficialRow(row)
                        : parseLegacyRow(row, index);
                }).filter(r => r.sku || r.name);

                setImportedData(parsedRows);
                setStep('PREVIEW');

                if (importFormat === 'LEGACY') {
                    toast.info(`Se detectaron ${parsedRows.length} productos. Se asignaron valores por defecto para revisión.`);
                }
            } catch (error) {
                console.error(error);
                toast.error('Error al procesar el archivo Excel');
            } finally {
                setIsProcessing(false);
            }
        };

        reader.readAsArrayBuffer(file);
    }, [importFormat]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'application/vnd.ms-excel': ['.xls'],
            'text/csv': ['.csv']
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

    const handleUpdateRow = (id: string, field: keyof ImportedRow, value: any) => {
        setImportedData(prev => prev.map(row => {
            if (row.id === id) {
                return { ...row, [field]: value };
            }
            return row;
        }));
    };

    const handleImport = async () => {
        setIsProcessing(true);
        try {
            const validRows = importedData.filter(r => r.isValid);

            if (validRows.length === 0) {
                toast.error('No hay datos válidos para importar');
                return;
            }

            const itemsToImport = validRows.map(row => {
                // Parse date DD/MM/YYYY to timestamp
                let expiry = Date.now() + 31536000000; // Default 1 year
                if (row.expiry_date) {
                    // Handle different date formats if needed, but assuming DD/MM/YYYY from parser
                    const parts = row.expiry_date.split('/');
                    if (parts.length === 3) {
                        expiry = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
                    } else if (row.expiry_date.includes('-')) {
                        const parts = row.expiry_date.split('-');
                        if (parts.length === 3) {
                            // Try YYYY-MM-DD
                            expiry = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])).getTime();
                        }
                    }
                }

                return {
                    id: uuidv4(),
                    sku: row.sku,
                    name: row.name,
                    dci: row.dci || row.name,
                    laboratory: row.laboratory || 'GENERICO',
                    price_sell: row.price_sell,
                    cost_net: row.cost_net,
                    stock_actual: row.stock,
                    lot_number: row.lot_number,
                    expiry_date: expiry,
                    location_id: row.location || 'BODEGA_CENTRAL',
                    is_refrigerated: row.is_refrigerated?.toUpperCase() === 'SI',
                    status: 'AVAILABLE',
                    // Default values for required fields in InventoryBatch
                    isp_register: 'PENDIENTE',
                    format: 'UNIDAD',
                    units_per_box: 1,
                    is_bioequivalent: false,
                    condition: 'VD',
                    category: 'MEDICAMENTO'
                } as any;
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
    const reviewCount = importedData.filter(r => r.needs_review).length;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <FileSpreadsheet className="text-green-600" />
                            Importación Masiva Inteligente
                        </h2>
                        <p className="text-sm text-gray-500">Carga de inventario desde Excel (Oficial o Legacy)</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden p-8">
                    {step === 'UPLOAD' ? (
                        <div className="h-full flex flex-col items-center justify-center gap-8">

                            {/* Format Selector */}
                            <div className="bg-gray-50 p-1 rounded-xl flex gap-1 border border-gray-200">
                                <button
                                    onClick={() => setImportFormat('OFFICIAL')}
                                    className={`px-6 py-3 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${importFormat === 'OFFICIAL'
                                        ? 'bg-white text-green-600 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    <FileSpreadsheet size={18} />
                                    Plantilla Oficial Vallenar
                                </button>
                                <button
                                    onClick={() => setImportFormat('LEGACY')}
                                    className={`px-6 py-3 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${importFormat === 'LEGACY'
                                        ? 'bg-white text-orange-600 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    <FileType size={18} />
                                    Formato Histórico / Legacy
                                </button>
                            </div>

                            <div className="text-center max-w-md">
                                {importFormat === 'OFFICIAL' ? (
                                    <>
                                        <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600">
                                            <Upload size={32} />
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-800 mb-2">Sube tu plantilla oficial</h3>
                                        <p className="text-gray-500 mb-6">
                                            Estructura estricta. Ideal para cargas limpias y validadas.
                                        </p>
                                        <button
                                            onClick={handleDownloadTemplate}
                                            className="px-6 py-3 bg-white border-2 border-green-500 text-green-600 font-bold rounded-xl hover:bg-green-50 transition-colors flex items-center gap-2 mx-auto"
                                        >
                                            <Download size={20} />
                                            Descargar Plantilla
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <div className="bg-orange-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-orange-600">
                                            <FileType size={32} />
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-800 mb-2">Importador Inteligente Legacy</h3>
                                        <p className="text-gray-500 mb-6">
                                            Sube tu Excel antiguo. El sistema intentará separar Nombre/Laboratorio y rellenará datos faltantes (Lotes, Fechas) para revisión.
                                        </p>
                                        <div className="text-xs text-left bg-orange-50 p-4 rounded-lg border border-orange-100 text-orange-800">
                                            <strong>Columnas esperadas (flexible):</strong>
                                            <ul className="list-disc pl-4 mt-1 space-y-1">
                                                <li>Col A: Código Barras (Si falta, se genera auto)</li>
                                                <li>Col B: Nombre Completo (ej: "AMOXICILINA LAB CHILE")</li>
                                                <li>Col C: Stock</li>
                                                <li>Col D: Precio Venta</li>
                                                <li>Col E: Costo Neto</li>
                                                <li>Col F: Grupo/Ubicación (Opcional)</li>
                                            </ul>
                                            <p className="mt-2 text-[10px] opacity-80">* El sistema intentará detectar si el orden es diferente (ej: Stock en Col B).</p>
                                        </div>
                                    </>
                                )}
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
                                            <p>Procesando e interpretando datos...</p>
                                        </div>
                                    ) : (
                                        <>
                                            <p className="font-bold text-gray-700 text-lg mb-2">
                                                Arrastra y suelta tu archivo aquí
                                            </p>
                                            <p className="text-gray-400 text-sm">Soporta .xlsx, .xls, .csv</p>
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
                                        <p className="text-sm text-green-800 font-bold">Listos para Importar</p>
                                        <p className="text-2xl font-bold text-green-700">{validCount}</p>
                                    </div>
                                </div>
                                {reviewCount > 0 && (
                                    <div className="flex-1 bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center gap-3">
                                        <Edit2 className="text-orange-600" size={24} />
                                        <div>
                                            <p className="text-sm text-orange-800 font-bold">Requieren Revisión</p>
                                            <p className="text-2xl font-bold text-orange-700">{reviewCount}</p>
                                        </div>
                                    </div>
                                )}
                                <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
                                    <AlertTriangle className="text-red-600" size={24} />
                                    <div>
                                        <p className="text-sm text-red-800 font-bold">Errores Bloqueantes</p>
                                        <p className="text-2xl font-bold text-red-700">{errorCount}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 overflow-auto border border-gray-200 rounded-xl shadow-inner bg-gray-50">
                                <table className="w-full text-sm text-left border-collapse">
                                    <thead className="bg-white text-gray-700 font-bold sticky top-0 shadow-sm z-10">
                                        <tr>
                                            <th className="p-3 border-b">Estado</th>
                                            <th className="p-3 border-b">SKU</th>
                                            <th className="p-3 border-b">Nombre Producto</th>
                                            <th className="p-3 border-b">Laboratorio</th>
                                            <th className="p-3 border-b">Precio</th>
                                            <th className="p-3 border-b">Stock</th>
                                            <th className="p-3 border-b w-32">Lote</th>
                                            <th className="p-3 border-b w-32">Vencimiento</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 bg-white">
                                        {importedData.slice(0, 200).map((row) => (
                                            <tr key={row.id} className={`group transition-colors ${!row.isValid ? 'bg-red-50' :
                                                row.needs_review ? 'bg-orange-50/50 hover:bg-orange-50' :
                                                    'hover:bg-gray-50'
                                                }`}>
                                                <td className="p-3">
                                                    {!row.isValid ? (
                                                        <div className="group/tooltip relative">
                                                            <AlertTriangle size={16} className="text-red-500 cursor-help" />
                                                            <div className="absolute left-6 top-0 bg-red-800 text-white text-xs p-2 rounded shadow-lg w-48 hidden group-hover/tooltip:block z-20">
                                                                {row.errors.join(', ')}
                                                            </div>
                                                        </div>
                                                    ) : row.needs_review ? (
                                                        <div title="Datos autogenerados. Revise si es necesario.">
                                                            <Edit2 size={16} className="text-orange-500" />
                                                        </div>
                                                    ) : (
                                                        <CheckCircle size={16} className="text-green-500" />
                                                    )}
                                                </td>
                                                <td className="p-3 font-mono text-xs">{row.sku}</td>
                                                <td className="p-3 font-bold text-gray-800">
                                                    <input
                                                        type="text"
                                                        value={row.name}
                                                        onChange={(e) => handleUpdateRow(row.id, 'name', e.target.value)}
                                                        className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded w-full text-sm font-bold"
                                                    />
                                                </td>
                                                <td className="p-3 text-gray-600">
                                                    <input
                                                        type="text"
                                                        value={row.laboratory}
                                                        onChange={(e) => handleUpdateRow(row.id, 'laboratory', e.target.value)}
                                                        className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded w-full text-xs"
                                                    />
                                                </td>
                                                <td className="p-3">${row.price_sell.toLocaleString()}</td>
                                                <td className="p-3">{row.stock}</td>
                                                <td className="p-3">
                                                    <input
                                                        type="text"
                                                        value={row.lot_number}
                                                        onChange={(e) => handleUpdateRow(row.id, 'lot_number', e.target.value)}
                                                        className={`w-full px-2 py-1 rounded border text-xs ${row.lot_number === 'LOTE-MIGRACION' ? 'border-orange-300 bg-orange-50 text-orange-800' : 'border-gray-200'
                                                            }`}
                                                    />
                                                </td>
                                                <td className="p-3">
                                                    <input
                                                        type="text"
                                                        value={row.expiry_date}
                                                        onChange={(e) => handleUpdateRow(row.id, 'expiry_date', e.target.value)}
                                                        className="w-full px-2 py-1 rounded border border-gray-200 text-xs"
                                                        placeholder="DD/MM/YYYY"
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {importedData.length > 200 && (
                                    <div className="p-4 text-center text-gray-500 text-sm bg-gray-50 border-t border-gray-200">
                                        Mostrando primeros 200 de {importedData.length} registros. Los demás se importarán correctamente.
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
                                {isProcessing ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                                Confirmar e Importar ({validCount})
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
