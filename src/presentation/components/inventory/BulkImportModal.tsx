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
    price: number;
    price_sell_box: number;
    cost_net: number;
    stock: number;
    lot_number: string;
    expiry_date: string; // DD/MM/YYYY
    location?: string;
    is_refrigerated?: string; // SI/NO
    units_per_box?: number;
    price_sell_unit?: number;
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
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadMessage, setUploadMessage] = useState('');
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
            price: price_sell,
            price_sell_box: price_sell,
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

    const parseLegacyRow = (row: any, index: number): ImportedRow => {
        const errors: string[] = [];

        // --- ROBUST & SIMPLE PARSER (Direct Extraction) ---

        // Helper: Find value by fuzzy column name
        const findVal = (row: any, keys: string[]) => {
            const foundKey = Object.keys(row).find(k =>
                keys.some(key => k.toLowerCase().trim() === key.toLowerCase())
            );
            return foundKey ? row[foundKey] : null;
        };

        // 1. NOMBRE & LABORATORIO (Smart Regex Parser)
        let rawName = findVal(row, ['producto', 'nombre', 'descripcion']) || 'SIN NOMBRE';
        let cleanName = String(rawName).trim();
        let laboratory = 'GENÉRICO';

        // Regex para extraer laboratorio al final (Ej: "PARACETAMOL 500MG LAB CHILE")
        const labMatch = cleanName.match(/\sLAB[\.\s]\s*(.+)$/i);
        if (labMatch) {
            laboratory = labMatch[1].trim(); // Extrae "CHILE", "SAVAL", etc.
            cleanName = cleanName.replace(labMatch[0], '').trim(); // Quita el laboratorio del nombre
        }

        // 2. SKU (Sanitización Científica)
        let rawSku = findVal(row, ['código barras', 'codigo barras', 'sku', 'barcode', 'code', 'codigo']);
        let sku = rawSku ? String(rawSku).trim() : '';

        // Fix Scientific Notation (e.g. "7.80E+12")
        if (sku.includes('E+')) {
            sku = Number(rawSku).toLocaleString('fullwide', { useGrouping: false });
        }

        // 3. PRECIO VENTA
        let rawPrice = findVal(row, ['precio venta', 'pvp', 'precio', 'venta', 'valor']);
        let price_sell = 0;
        if (rawPrice) {
            price_sell = parseInt(String(rawPrice).replace(/[^0-9]/g, ''), 10) || 0;
        }

        // 4. STOCK
        let rawStock = findVal(row, ['stock', 'cantidad', 'saldo']);
        let stock = parseInt(String(rawStock || 0), 10);

        // 5. COSTO (Auto-fill si falta)
        let rawCost = findVal(row, ['costo neto', 'ppp', 'costo']);
        let cost_net = 0;
        if (rawCost) {
            cost_net = parseInt(String(rawCost).replace(/[^0-9]/g, ''), 10) || 0;
        } else {
            // Default to 0 if not found, to be safe. Or estimate.
            // Let's keep estimate for now but make it safe.
            cost_net = price_sell > 0 ? Math.round(price_sell * 0.7) : 0;
        }

        // --- FALLBACKS & GENERATION ---

        // 1. SKU Generation (Silent Error Handling)
        if (!sku || sku.length < 3) {
            sku = `GEN-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
            // errors.push('SKU Generado (Faltaba en Excel)'); // No longer an error, just a note if needed
        }

        if (cleanName === 'SIN NOMBRE' || !cleanName) {
            errors.push('Falta Nombre');
        }

        if (price_sell <= 0 && stock > 0) {
            // Warning but maybe allow? Let's require price for now as it's critical for POS.
            // Actually, user said "Si tengo Nombre y Precio, el producto ENTRA".
            errors.push('Falta Precio');
        }

        // 5. OTROS (Defaults de Migración - OPCIONALES)
        const dci = cleanName; // Default DCI to Name if missing
        const units_per_box = 1;
        const price_sell_unit = price_sell;

        // Auto-fill Obligatorios (Relaxed)
        const lot_number = 'GENERAL'; // Generic Lot
        const expiry_date = '31/12/2030'; // Far future default
        const isp_register = ''; // Optional
        const is_bioequivalent = false;

        // Infer Category (Smart Location)
        let category = 'MEDICAMENTO';
        let location = findVal(row, ['grupo', 'categoría', 'ubicacion']) || 'BODEGA_CENTRAL';
        const upperName = cleanName.toUpperCase();
        if (upperName.includes('SHAMPOO') || upperName.includes('JABON') || upperName.includes('CREMA')) {
            category = 'COSMETICA';
        } else if (upperName.includes('VITAMINA') || upperName.includes('SUPLEMENTO')) {
            category = 'SUPLEMENTO';
        }

        return {
            id: uuidv4(),
            sku,
            name: cleanName,
            dci,
            laboratory,
            price_sell,
            price: price_sell,
            price_sell_box: price_sell,
            price_sell_unit,
            cost_net,
            stock,
            units_per_box,
            lot_number,
            expiry_date,
            location: 'BODEGA_CENTRAL',
            is_refrigerated: 'NO',
            isValid: errors.length === 0,
            errors,
            needs_review: sku.startsWith('GEN-') // Flag for review if SKU was generated
        };
    };

    const onDrop = useCallback((acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (!file) return;

        setIsProcessing(true);
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const result = e.target?.result;
                if (!result) throw new Error("No se pudo leer el archivo");

                const data = new Uint8Array(result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                let parsedRows: ImportedRow[] = [];

                if (importFormat === 'OFFICIAL') {
                    // Official format uses strict array indexing
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    const rows = jsonData.slice(1) as any[][]; // Skip header
                    parsedRows = rows.map(parseOfficialRow).filter(r => r.sku || r.name);
                } else {
                    // Legacy format uses Header Names (Object based)
                    const jsonData = XLSX.utils.sheet_to_json(worksheet); // Returns objects
                    parsedRows = jsonData.map((row: any, index: number) => parseLegacyRow(row, index)).filter(r => r.sku || r.name);
                }

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

            // --- DEDUPLICATION LOGIC ---
            const uniqueMap = new Map<string, any>();

            validRows.forEach(row => {
                const existing = uniqueMap.get(row.sku);

                // Parse date DD/MM/YYYY to timestamp (Logic moved here for cleaner map)
                let expiry = Date.now() + 31536000000; // Default 1 year
                if (row.expiry_date) {
                    const parts = row.expiry_date.split('/');
                    if (parts.length === 3) {
                        expiry = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
                    } else if (row.expiry_date.includes('-')) {
                        const parts = row.expiry_date.split('-');
                        if (parts.length === 3) {
                            expiry = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])).getTime();
                        }
                    }
                }

                const itemData = {
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
                    isp_register: 'PENDIENTE',
                    format: 'UNIDAD',
                    units_per_box: row.units_per_box || 1,
                    price_sell_unit: row.price_sell_unit || row.price_sell,
                    is_bioequivalent: false,
                    condition: 'VD',
                    category: 'MEDICAMENTO'
                };

                if (existing) {
                    // MERGE STRATEGY
                    existing.stock_actual += itemData.stock_actual; // Sum Stock
                    existing.price_sell = Math.max(existing.price_sell, itemData.price_sell); // Max Price
                    existing.price_sell_unit = Math.max(existing.price_sell_unit, itemData.price_sell_unit);
                    // Keep longest name
                    if (itemData.name.length > existing.name.length) existing.name = itemData.name;
                } else {
                    uniqueMap.set(row.sku, itemData);
                }
            });

            const itemsToImport = Array.from(uniqueMap.values());

            // 1. Import to Local Store (Optimistic UI)
            await importInventory(itemsToImport);

            // 2. Persist to Database (Tiger Cloud)
            const { TigerDataService } = await import('../../../domain/services/TigerDataService');
            await TigerDataService.uploadBulkInventory(itemsToImport, (progress, message) => {
                // setUploadProgress(progress);
                // setUploadMessage(message);
            });

            // 3. Refresh Data
            const { fetchInventory } = await import('../../../actions/sync');
            await fetchInventory();

            toast.success('Inventario Importado y Unificado', {
                description: `${itemsToImport.length} productos únicos procesados (se fusionaron duplicados).`
            });
            onClose();
            setImportedData([]);
            setStep('UPLOAD');
        } catch (error) {
            console.error('Import error:', error);
            toast.error('Error en la importación', {
                description: 'Algunos datos se guardaron localmente, pero falló la sincronización con la nube.'
            });
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
                                        <p className="text-gray-500 mb-4">
                                            Sube tu Excel antiguo. El sistema intentará separar Nombre/Laboratorio y rellenará datos faltantes.
                                        </p>
                                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6 text-xs text-blue-800 text-left">
                                            <strong>⚠️ Nota Importante:</strong> El sistema usará el <u>Código de Barras</u> como SKU principal para facilitar la venta con pistola. Si hay duplicados en el Excel, se sumará el stock.
                                        </div>
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
                                            <th className="p-3 border-b">Unidades</th>
                                            <th className="p-3 border-b">Precio</th>
                                            <th className="p-3 border-b">P. Unit</th>
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
                                                <td className="p-3 text-center bg-blue-50/50 font-mono text-xs text-blue-700">
                                                    {row.units_per_box || 1}
                                                </td>
                                                <td className="p-3 font-bold">${(row.price_sell || 0).toLocaleString()}</td>
                                                <td className="p-3 text-xs text-slate-500">${row.price_sell_unit?.toLocaleString()}</td>
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
                        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                            {isUploading ? (
                                <div className="w-full">
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="font-medium text-slate-600">{uploadMessage}</span>
                                        <span className="font-bold text-cyan-600">{uploadProgress}%</span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                        <div
                                            className="bg-cyan-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                                            style={{ width: `${uploadProgress}%` }}
                                        ></div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <button
                                        onClick={() => {
                                            setStep('UPLOAD');
                                            setImportedData([]);
                                        }}
                                        className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleImport}
                                        disabled={validCount === 0 || isProcessing}
                                        className="px-6 py-2 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-200 flex items-center gap-2"
                                    >
                                        {isProcessing ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                                        Confirmar e Importar ({validCount})
                                    </button>
                                </>
                            )}
                        </div>
                    ) : (
                        <div />
                    )}
                </div>
            </div>
        </div>
    );
};

export default BulkImportModal;
