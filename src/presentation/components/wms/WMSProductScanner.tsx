/**
 * WMSProductScanner - Componente unificado de escáner + búsqueda de productos
 * 
 * Detecta automáticamente si la entrada es un código de barras (input rápido)
 * o una búsqueda manual por texto. Compatible con lectores físicos de barcode
 * y cámara de dispositivos móviles (Android/iOS) vía html5-qrcode.
 * 
 * Skills activos: arquitecto-offline, timezone-santiago
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    ScanBarcode, Search, X, Loader2, Camera, Package, Smartphone
} from 'lucide-react';
import { InventoryBatch } from '@/domain/types';
import { MobileScanner } from '@/components/shared/MobileScanner';
import { usePlatform } from '@/hooks/usePlatform';
import { toast } from 'sonner';

interface WMSProductScannerProps {
    /** Inventario actual para buscar productos */
    inventory: InventoryBatch[];
    /** Callback cuando se selecciona un producto */
    onProductSelected: (product: InventoryBatch) => void;
    /** Placeholder personalizado */
    placeholder?: string;
    /** Autofocus al montar */
    autoFocus?: boolean;
    /** Deshabilitar input */
    disabled?: boolean;
    /** Mostrar spinner de carga en el input */
    isLoading?: boolean;
}

// Constantes para detección de barcode scanner
const BARCODE_MIN_LENGTH = 6;
const BARCODE_MAX_INPUT_TIME_MS = 100; // Si > 6 chars en < 100ms = barcode

export const WMSProductScanner: React.FC<WMSProductScannerProps> = ({
    inventory,
    onProductSelected,
    placeholder = 'Escanear código o buscar producto...',
    autoFocus = true,
    disabled = false,
    isLoading = false,
}) => {
    const { isMobile } = usePlatform();
    const [searchTerm, setSearchTerm] = useState('');
    const [showResults, setShowResults] = useState(false);
    const [isBarcodeScan, setIsBarcodeScan] = useState(false);
    const [showCamera, setShowCamera] = useState(false);
    const [hasCamera, setHasCamera] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const lastInputTime = useRef<number>(0);
    const inputBuffer = useRef<string>('');
    const barcodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const isRetailVariant = useCallback((item: InventoryBatch): boolean => {
        if (item.is_retail_lot === true) return true;
        return /^\s*\[AL DETAL\]/i.test(item.name || '');
    }, []);

    const exactCodeIndex = useMemo(() => {
        const map = new Map<string, InventoryBatch>();
        for (const item of inventory) {
            const existingSku = map.get(item.sku);
            if (!existingSku) {
                map.set(item.sku, item);
            } else {
                const existingIsRetail = isRetailVariant(existingSku);
                const currentIsRetail = isRetailVariant(item);

                const shouldReplace =
                    (existingIsRetail && !currentIsRetail) ||
                    (existingIsRetail === currentIsRetail && item.stock_actual > existingSku.stock_actual);

                if (shouldReplace) {
                    map.set(item.sku, item);
                }
            }

            if (item.barcode) map.set(item.barcode, item);
        }
        return map;
    }, [inventory, isRetailVariant]);

    const indexedInventory = useMemo(() => {
        return inventory.map(item => ({
            item,
            name: item.name.toLowerCase(),
            sku: item.sku.toLowerCase(),
            barcode: item.barcode?.toLowerCase() || '',
            laboratory: item.laboratory?.toLowerCase() || '',
            dci: item.dci?.toLowerCase() || '',
        }));
    }, [inventory]);

    // Detectar si hay cámara disponible (móvil o HTTPS)
    useEffect(() => {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
            navigator.mediaDevices.enumerateDevices()
                .then(devices => {
                    const videoDevices = devices.filter(d => d.kind === 'videoinput');
                    setHasCamera(videoDevices.length > 0);
                })
                .catch(() => setHasCamera(false));
        }
    }, []);

    // Click outside para cerrar resultados
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setShowResults(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Detección de barcode: input rápido
    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        const now = Date.now();

        // Resetear timer de barcode
        if (barcodeTimer.current) clearTimeout(barcodeTimer.current);

        // Si el input llega muy rápido, podría ser barcode
        if (now - lastInputTime.current < BARCODE_MAX_INPUT_TIME_MS && inputBuffer.current.length > 0) {
            inputBuffer.current = value;
        } else {
            inputBuffer.current = value;
        }
        lastInputTime.current = now;

        setSearchTerm(value);
        setShowResults(value.length > 0);
        setIsBarcodeScan(false);

        // Esperar a que termine la ráfaga de input del scanner
        barcodeTimer.current = setTimeout(() => {
            if (inputBuffer.current.length >= BARCODE_MIN_LENGTH) {
                // Intentar encontrar por barcode exacto
                const exactMatch = exactCodeIndex.get(inputBuffer.current);
                if (exactMatch) {
                    setIsBarcodeScan(true);
                    onProductSelected(exactMatch);
                    setSearchTerm('');
                    setShowResults(false);
                    inputBuffer.current = '';
                    inputRef.current?.focus();
                }
            }
        }, 150); // Esperar 150ms después del último char
    }, [exactCodeIndex, onProductSelected]);

    // Callback cuando la cámara escanea un código
    const handleCameraScan = useCallback((code: string) => {
        const match = exactCodeIndex.get(code);
        if (match) {
            onProductSelected(match);
            toast.success(`✅ ${match.name} agregado`);
            // No cerrar cámara para permitir escaneo continuo
        } else {
            toast.error(`Producto no encontrado: ${code}`);
        }
    }, [exactCodeIndex, onProductSelected]);

    // Filtrar productos por búsqueda
    const filteredProducts = useMemo(() => {
        if (searchTerm.length < 2) return [];

        const term = searchTerm.toLowerCase();
        const variantMap = new Map<string, InventoryBatch>();

        for (const candidate of indexedInventory) {
            const matches =
                candidate.name.includes(term) ||
                candidate.sku.includes(term) ||
                candidate.barcode.includes(term) ||
                candidate.laboratory.includes(term) ||
                candidate.dci.includes(term);

            if (!matches) continue;

            const productKey = candidate.item.product_id || candidate.item.sku;
            const variantKey = `${productKey}::${isRetailVariant(candidate.item) ? 'retail' : 'standard'}`;
            const existing = variantMap.get(variantKey);
            if (!existing || candidate.item.stock_actual > existing.stock_actual) {
                variantMap.set(variantKey, candidate.item);
            }

            if (variantMap.size >= 15) break;
        }

        return Array.from(variantMap.values()).slice(0, 15);
    }, [indexedInventory, isRetailVariant, searchTerm]);

    const handleSelectProduct = (product: InventoryBatch) => {
        onProductSelected(product);
        setSearchTerm('');
        setShowResults(false);
        inputRef.current?.focus();
    };

    const clearSearch = () => {
        setSearchTerm('');
        setShowResults(false);
        inputRef.current?.focus();
    };

    return (
        <>
            <div ref={containerRef} className="relative">
                {/* Input principal + Botón Cámara */}
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                            {isLoading ? (
                                <Loader2 size={20} className="animate-spin" />
                            ) : (
                                <ScanBarcode size={20} className={isBarcodeScan ? 'text-sky-500' : ''} />
                            )}
                        </div>
                        <input
                            ref={inputRef}
                            type="text"
                            value={searchTerm}
                            onChange={handleInputChange}
                            onFocus={() => searchTerm.length > 0 && setShowResults(true)}
                            placeholder={placeholder}
                            autoFocus={autoFocus && !isMobile}
                            disabled={disabled}
                            className="w-full pl-11 pr-10 py-3 bg-white border-2 border-slate-200 
                                     rounded-2xl text-slate-800 font-medium text-base
                                     placeholder:text-slate-400
                                     focus:border-sky-400 focus:ring-4 focus:ring-sky-100
                                     disabled:bg-slate-50 disabled:text-slate-400
                                     transition-all duration-200 outline-none"
                        />
                        {searchTerm && (
                            <button
                                onClick={clearSearch}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 
                                         hover:text-slate-600 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        )}
                    </div>

                    {/* Botón Cámara — solo visible si hay cámara disponible */}
                    {hasCamera && (
                        <button
                            onClick={() => setShowCamera(true)}
                            disabled={disabled}
                            className={`shrink-0 rounded-2xl bg-gradient-to-br from-sky-500 to-sky-600 
                                     text-white shadow-lg shadow-sky-500/30 
                                     hover:from-sky-600 hover:to-sky-700 
                                     active:scale-95 disabled:opacity-40
                                     transition-all duration-200 flex items-center justify-center
                                     press-effect touch-target
                                     ${isMobile ? 'w-14 h-14' : 'w-12 h-12'}`}
                            title="Escanear con cámara"
                        >
                            <Camera size={isMobile ? 24 : 22} />
                        </button>
                    )}
                </div>

                {/* Indicador de modo */}
                {isBarcodeScan && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-emerald-600 font-medium animate-in fade-in duration-300">
                        <ScanBarcode size={12} />
                        Código escaneado detectado
                    </div>
                )}

                {/* Hint cámara para móvil */}
                {hasCamera && !searchTerm && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
                        <Smartphone size={12} />
                        <span>Toca 📷 para escanear con la cámara del dispositivo</span>
                    </div>
                )}

                {/* Resultados de búsqueda */}
                {showResults && filteredProducts.length > 0 && (
                    <div className="absolute z-50 left-0 right-0 mt-2 bg-white border border-slate-200 
                                  rounded-2xl shadow-xl overflow-hidden max-h-72 overflow-y-auto
                                  animate-in fade-in slide-in-from-top-2 duration-200">
                        {filteredProducts.map((product) => (
                            <button
                                key={product.id}
                                onClick={() => handleSelectProduct(product)}
                                className="w-full text-left px-4 py-3 hover:bg-sky-50 
                                         border-b last:border-0 border-slate-100 
                                         transition-colors duration-150 flex items-center gap-3"
                            >
                                <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
                                    <Package size={16} className="text-sky-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-slate-800 truncate text-sm">
                                        {product.name}
                                    </p>
                                    <p className="text-xs text-slate-500 flex gap-2">
                                        <span>{product.sku}</span>
                                        {product.laboratory && (
                                            <span className="text-slate-400">• {product.laboratory}</span>
                                        )}
                                    </p>
                                </div>
                                <div className="text-right shrink-0">
                                    <span className={`text-sm font-bold ${product.stock_actual > 0 ? 'text-emerald-600' : 'text-red-500'
                                        }`}>
                                        {product.stock_actual}
                                    </span>
                                    <p className="text-[10px] text-slate-400 uppercase">stock</p>
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                {/* Sin resultados */}
                {showResults && searchTerm.length >= 2 && filteredProducts.length === 0 && (
                    <div className="absolute z-50 left-0 right-0 mt-2 bg-white border border-slate-200 
                                  rounded-2xl shadow-xl p-4 text-center
                                  animate-in fade-in slide-in-from-top-2 duration-200">
                        <Search size={24} className="mx-auto text-slate-300 mb-2" />
                        <p className="text-sm text-slate-500">
                            No se encontraron productos para "<strong>{searchTerm}</strong>"
                        </p>
                    </div>
                )}
            </div>

            {/* Modal de cámara fullscreen — MobileScanner existente con soporte iOS/Android */}
            {showCamera && (
                <MobileScanner
                    onClose={() => setShowCamera(false)}
                    onScan={handleCameraScan}
                    continuous={true}
                />
            )}
        </>
    );
};

export default WMSProductScanner;
