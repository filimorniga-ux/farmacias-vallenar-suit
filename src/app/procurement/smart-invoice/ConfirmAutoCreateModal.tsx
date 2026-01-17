import React, { useState, useEffect } from 'react';
import { X, CheckCircle, Package, AlertTriangle, Sparkles, Truck, Plus, Info, Search, FileText } from 'lucide-react';
import ProductFormModal from '@/presentation/components/inventory/ProductFormModal';

interface ConfirmAutoCreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (products: NewProductData[], mappings: any[], supplierData?: any) => void;
    items: any[];
    supplier?: any;
}

export interface NewProductData {
    name: string;
    price: number;
    cost: number;
    supplierSku?: string;
    description?: string;
    isBioequivalent?: boolean;
    dci?: string;
    units_per_box?: number;
    barcode?: string;
}

export function ConfirmAutoCreateModal({ isOpen, onClose, onConfirm, items, supplier }: ConfirmAutoCreateModalProps) {
    const [products, setProducts] = useState<NewProductData[]>([]);
    const [extraMappings, setExtraMappings] = useState<any[]>([]);
    const [localSupplier, setLocalSupplier] = useState<any>(null);
    const [showSupplierEdit, setShowSupplierEdit] = useState(false);

    // Estado para modal full
    const [fullEditIndex, setFullEditIndex] = useState<number | null>(null);

    // Estado para búsqueda manual (Link with AI)
    const [searchModalOpen, setSearchModalOpen] = useState(false);
    const [searchIndex, setSearchIndex] = useState<number | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const handleManualSearch = async (term: string) => {
        if (term.length < 2) return;
        setIsSearching(true);
        try {
            const { searchProductsSecure } = await import('@/actions/search-actions');
            const res = await searchProductsSecure(term);
            if (res.success && res.data) {
                setSearchResults(res.data);
            }
        } catch (err) {
            console.error(err);
        }
        setIsSearching(false);
    };

    const handleSelectManualLink = (product: any) => {
        if (searchIndex !== null) {
            handlePickSuggestion(searchIndex, { productId: product.id, sku: product.sku });
            setSearchModalOpen(false);
            setSearchIndex(null);
            setSearchTerm('');
        }
    };

    const openSearchFor = (index: number, name: string) => {
        setSearchIndex(index);
        setSearchTerm(name); // Pre-fill with invoice name
        handleManualSearch(name); // Auto-search
        setSearchModalOpen(true);
    };

    useEffect(() => {
        if (isOpen) {
            const newProds = items
                .filter(i => i.mapping_status !== 'MAPPED' && !extraMappings.find(m => m.supplierSku === i.supplier_sku))
                .map(i => ({
                    name: i.description || 'Producto Nuevo',
                    cost: i.unit_cost,
                    price: Math.round(i.unit_cost * 1.4), // 40% margin default
                    supplierSku: i.supplier_sku,
                    description: i.description,
                    isBioequivalent: i.is_bioequivalent || false,
                    dci: i.active_principle || '',
                    units_per_box: i.units_per_package || 1,
                    barcode: ''
                }));
            setProducts(newProds);
            setLocalSupplier(supplier);
            setShowSupplierEdit(supplier?.is_new || false);
        }
    }, [isOpen, items, supplier, extraMappings]);

    const handleUpdate = (index: number, field: keyof NewProductData, value: any) => {
        const updated = [...products];
        updated[index] = { ...updated[index], [field]: value };
        setProducts(updated);
    };

    const handlePickSuggestion = (index: number, suggestion: any) => {
        const item = items.filter(i => i.mapping_status !== 'MAPPED' && !extraMappings.find(m => m.supplierSku === i.supplier_sku))[index];
        setExtraMappings([...extraMappings, {
            supplierSku: item.supplier_sku,
            productId: suggestion.productId
        }]);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4 flex flex-col max-h-[95vh]">

                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            <Package className="text-purple-600" />
                            Revisión y Creación de Productos
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">Configure los datos maestros antes de ingresar el stock.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors shadow-sm">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-8 flex-1">

                    {/* SECCIÓN PROVEEDOR */}
                    {localSupplier && (
                        <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
                            <div
                                className="p-4 bg-gray-50 border-b flex justify-between items-center cursor-pointer"
                                onClick={() => setShowSupplierEdit(!showSupplierEdit)}
                            >
                                <div className="flex items-center gap-2">
                                    <Truck className="text-slate-600" size={20} />
                                    <span className="font-semibold text-slate-800">
                                        Proveedor: {localSupplier.name} ({localSupplier.rut})
                                    </span>
                                    {localSupplier.is_new && (
                                        <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-bold">NUEVO</span>
                                    )}
                                </div>
                                <button className="text-purple-600 text-sm font-medium">
                                    {showSupplierEdit ? 'Cerrar edición' : 'Editar datos proveedor'}
                                </button>
                            </div>

                            {showSupplierEdit && (
                                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-50/30">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Nombre Fantasía</label>
                                        <input
                                            type="text"
                                            value={localSupplier.fantasy_name || ''}
                                            onChange={e => setLocalSupplier({ ...localSupplier, fantasy_name: e.target.value })}
                                            className="w-full px-3 py-2 border rounded-lg text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Teléfono</label>
                                        <input
                                            type="text"
                                            value={localSupplier.phone || ''}
                                            onChange={e => setLocalSupplier({ ...localSupplier, phone: e.target.value })}
                                            className="w-full px-3 py-2 border rounded-lg text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Sitio Web</label>
                                        <input
                                            type="text"
                                            value={localSupplier.website || ''}
                                            onChange={e => setLocalSupplier({ ...localSupplier, website: e.target.value })}
                                            className="w-full px-3 py-2 border rounded-lg text-sm"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Dirección</label>
                                        <input
                                            type="text"
                                            value={localSupplier.address || ''}
                                            onChange={e => setLocalSupplier({ ...localSupplier, address: e.target.value })}
                                            className="w-full px-3 py-2 border rounded-lg text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Giro / Actividad</label>
                                        <input
                                            type="text"
                                            value={localSupplier.activity || ''}
                                            onChange={e => setLocalSupplier({ ...localSupplier, activity: e.target.value })}
                                            className="w-full px-3 py-2 border rounded-lg text-sm"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* SECCIÓN PRODUCTOS */}
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h4 className="font-bold text-gray-800 flex items-center gap-2">
                                <Plus className="bg-green-100 text-green-600 rounded p-0.5" size={20} />
                                Productos Nuevos a Crear ({products.length})
                            </h4>
                        </div>

                        {products.length === 0 && extraMappings.length > 0 && (
                            <div className="p-8 text-center bg-green-50 rounded-xl border border-green-200 border-dashed">
                                <CheckCircle className="mx-auto text-green-500 mb-2" size={32} />
                                <p className="text-green-800 font-medium">Todos los items han sido vinculados a productos existentes.</p>
                            </div>
                        )}

                        {products.map((prod, idx) => {
                            const originalItem = items.filter(i => i.mapping_status !== 'MAPPED' && !extraMappings.find(m => m.supplierSku === i.supplier_sku))[idx];
                            const suggestions = originalItem?.suggested_products || [];

                            return (
                                <div key={idx} className="bg-white border rounded-xl shadow-sm overflow-hidden border-l-4 border-l-purple-500">
                                    <div className="p-4">
                                        <div className="flex flex-col lg:flex-row gap-6">
                                            {/* Columna Datos Factura */}
                                            <div className="lg:w-1/3">
                                                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 h-full">
                                                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Dato extraído de factura</span>
                                                    <p className="text-sm font-bold text-slate-700 leading-tight">{prod.description}</p>
                                                    <div className="mt-3 flex gap-4 text-xs">
                                                        <div><span className="text-slate-400">SKU Prov:</span> <span className="font-mono bg-slate-200 px-1 rounded">{prod.supplierSku || 'N/A'}</span></div>
                                                        <div><span className="text-slate-400">Costo:</span> <span className="font-bold text-slate-700">${prod.cost.toLocaleString()}</span></div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Columna Formulario Maestro */}
                                            <div className="flex-1 space-y-4">
                                                <div className="flex justify-end gap-3">
                                                    <button
                                                        onClick={() => openSearchFor(idx, prod.name)}
                                                        className="flex items-center gap-1 text-xs text-amber-600 font-bold hover:underline bg-amber-50 px-2 py-1 rounded-lg border border-amber-200"
                                                    >
                                                        <Sparkles size={14} />
                                                        Vincular con Existente
                                                    </button>
                                                    <button
                                                        onClick={() => setFullEditIndex(idx)}
                                                        className="flex items-center gap-1 text-xs text-purple-600 font-bold hover:underline"
                                                    >
                                                        <FileText size={14} />
                                                        Abrir Ficha Completa
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                    <div className="md:col-span-2">
                                                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Nombre Maestro (Editable)</label>
                                                        <input
                                                            type="text"
                                                            value={prod.name}
                                                            onChange={e => handleUpdate(idx, 'name', e.target.value)}
                                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm font-semibold"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Precio Venta sugerido</label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                                                            <input
                                                                type="number"
                                                                value={prod.price}
                                                                onChange={e => handleUpdate(idx, 'price', Number(e.target.value))}
                                                                className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 text-sm font-bold text-green-700"
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Campos extra de Producto Maestro */}
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Principio Activo (DCI)</label>
                                                        <input
                                                            type="text"
                                                            value={prod.dci}
                                                            placeholder="Ej: Paracetamol"
                                                            onChange={e => handleUpdate(idx, 'dci', e.target.value)}
                                                            className="w-full px-3 py-2 border border-blue-100 bg-blue-50/30 rounded-lg text-sm"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Unidades por Caja/Envase</label>
                                                        <input
                                                            type="number"
                                                            value={prod.units_per_box}
                                                            onChange={e => handleUpdate(idx, 'units_per_box', Number(e.target.value))}
                                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Código de Barras</label>
                                                        <input
                                                            type="text"
                                                            value={prod.barcode}
                                                            placeholder="Escanee o ingrese"
                                                            onChange={e => handleUpdate(idx, 'barcode', e.target.value)}
                                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                                        />
                                                    </div>

                                                    <div className="flex items-center gap-4 lg:col-span-1">
                                                        <label className="flex items-center gap-2 cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={prod.isBioequivalent || false}
                                                                onChange={e => handleUpdate(idx, 'isBioequivalent', e.target.checked)}
                                                                className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                                                            />
                                                            <span className="text-xs font-bold text-slate-600">Bioequivalente</span>
                                                        </label>
                                                    </div>

                                                    <div className="flex items-end justify-end flex-1 lg:col-span-2">
                                                        <div className="text-[10px] text-gray-400 bg-gray-100 px-2 py-1 rounded">
                                                            Costo unitario real estimado: <span className="font-bold text-gray-600">${Math.round(prod.cost / (prod.units_per_box || 1))}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* SUGESTIONES SMART */}
                                        {suggestions.length > 0 && (
                                            <div className="mt-4 pt-4 border-t border-dashed border-gray-100">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Sparkles className="text-amber-500" size={14} />
                                                    <span className="text-xs font-bold text-amber-700 uppercase">¿Este producto ya existe en el inventario?</span>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {suggestions.map((sug: any, sIdx: number) => (
                                                        <button
                                                            key={sIdx}
                                                            onClick={() => handlePickSuggestion(idx, sug)}
                                                            className="flex items-center gap-2 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs px-3 py-1.5 rounded-full border border-amber-200 transition-all group"
                                                            title={`SKU: ${sug.sku}`}
                                                        >
                                                            <div className="flex flex-col items-start">
                                                                <span className="font-bold">{sug.productName}</span>
                                                                <span className="text-[10px] opacity-70">SKU: {sug.sku}</span>
                                                            </div>
                                                            <div className="bg-amber-500 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <CheckCircle size={12} />
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {extraMappings.length > 0 && (
                        <div className="bg-green-50/50 border border-green-100 rounded-xl p-4">
                            <h5 className="text-sm font-bold text-green-700 flex items-center gap-2 mb-2">
                                <CheckCircle size={16} />
                                Artículos vinculados manualmente ({extraMappings.length})
                            </h5>
                            <div className="flex flex-wrap gap-2">
                                {extraMappings.map((m, mi) => (
                                    <div key={mi} className="bg-white border border-green-200 rounded-lg px-3 py-1 text-xs text-green-800 flex items-center gap-2">
                                        <span className="opacity-60">{m.supplierSku}</span>
                                        →
                                        <span className="font-bold">ID: {m.productId.substring(0, 8)}...</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <div className="w-3 h-3 bg-purple-500 rounded-full" />
                            Nuevo ({products.length})
                        </div>
                        <div className="flex items-center gap-2 text-xs text-green-600">
                            <div className="w-3 h-3 bg-green-500 rounded-full" />
                            Vinculado ({extraMappings.length})
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 text-gray-600 hover:bg-gray-200 rounded-xl transition-colors font-bold text-sm"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={() => onConfirm(products, extraMappings, localSupplier)}
                            disabled={products.length === 0 && extraMappings.length === 0}
                            className="px-8 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl hover:shadow-lg hover:from-purple-700 hover:to-indigo-700 transition-all font-bold text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <CheckCircle size={18} />
                            Ingresar a Bodega
                        </button>
                    </div>
                </div>
            </div>

            {/* Nested Modal */}
            {fullEditIndex !== null && (
                <ProductFormModal
                    onClose={() => setFullEditIndex(null)}
                    initialValues={{
                        name: products[fullEditIndex].name,
                        sku: products[fullEditIndex].supplierSku,
                        cost: products[fullEditIndex].cost,
                        price: products[fullEditIndex].price,
                        dci: products[fullEditIndex].dci,
                        units_per_box: products[fullEditIndex].units_per_box,
                        barcode: products[fullEditIndex].barcode,
                    }}
                    onSuccess={(newProductId, productData) => {
                        // Agregar a mapeos
                        const itemSku = products[fullEditIndex].supplierSku;
                        if (itemSku) {
                            setExtraMappings(prev => [...prev, {
                                supplierSku: itemSku,
                                productId: newProductId
                            }]);
                            // Remover de lista de nuevos
                            setProducts(prev => prev.filter((_, i) => i !== fullEditIndex));
                        }
                        setFullEditIndex(null);
                    }}
                />
            )}
            {/* Modal Búsqueda Manual / AI Link */}
            {searchModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSearchModalOpen(false)} />
                    <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="p-4 border-b bg-amber-50 flex justify-between items-center">
                            <h3 className="font-bold text-amber-900 flex items-center gap-2">
                                <Sparkles size={18} className="text-amber-600" />
                                Vincular con Inventario Existente
                            </h3>
                            <button onClick={() => setSearchModalOpen(false)}><X size={20} className="text-amber-400" /></button>
                        </div>
                        <div className="p-4 border-b">
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Buscar por nombre, SKU o código de barras..."
                                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500"
                                    value={searchTerm}
                                    onChange={e => {
                                        setSearchTerm(e.target.value);
                                        handleManualSearch(e.target.value);
                                    }}
                                    autoFocus
                                />
                                <Search size={18} className="absolute left-3 top-2.5 text-gray-400" />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-50">
                            {isSearching ? (
                                <div className="p-4 text-center text-gray-400">Buscando en inventario...</div>
                            ) : searchResults.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 text-sm">
                                    No se encontraron productos en el inventario que coincidan con "{searchTerm}".
                                </div>
                            ) : (
                                searchResults.map((res: any) => (
                                    <div
                                        key={res.id}
                                        onClick={() => handleSelectManualLink(res)}
                                        className="p-3 bg-white border rounded-lg hover:border-amber-400 cursor-pointer transition shadow-sm group"
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-bold text-slate-800 group-hover:text-amber-700">{res.name}</p>
                                                <div className="flex gap-2 text-xs text-slate-500 mt-1">
                                                    <span className="bg-slate-100 px-1.5 py-0.5 rounded">SKU: {res.sku}</span>
                                                    {res.barcode && <span className="bg-slate-100 px-1.5 py-0.5 rounded">Bar: {res.barcode}</span>}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className="block font-bold text-green-600">${res.price?.toLocaleString()}</span>
                                                <div className="text-xs text-slate-400">Stock: {res.stock_actual}</div>
                                                <div className="text-[10px] text-amber-600 font-bold mt-1">Clic para vincular</div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
