import React, { useState, useMemo } from 'react';
import { X, Search, Plus, Trash2, Save, ShoppingCart, ChevronRight, Building2, Package, Send, Calendar, DollarSign } from 'lucide-react';
import { usePharmaStore } from '../../store/useStore';
import { toast } from 'sonner';

interface ManualOrderModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ManualOrderModal: React.FC<ManualOrderModalProps> = ({ isOpen, onClose }) => {
    const { suppliers, inventory, addPurchaseOrder } = usePharmaStore();

    // State
    const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    const [cart, setCart] = useState<{ sku: string; name: string; quantity: number; cost: number }[]>([]);

    // Derived Data
    const selectedSupplier = useMemo(() => suppliers.find(s => s.id === selectedSupplierId), [selectedSupplierId, suppliers]);

    // Smart Filtering: Prioritize supplier's products if any logic existed, otherwise search all
    const filteredProducts = useMemo(() => {
        if (!searchTerm) return [];

        let results = inventory.filter(p =>
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.sku.includes(searchTerm)
        );

        // Optional: If we had a way to know which products belong to a supplier, we would sort them here.
        // For now, we just return the top 10 matches.
        return results.slice(0, 10);
    }, [inventory, searchTerm]);

    // Financials
    const netTotal = useMemo(() => cart.reduce((acc, item) => acc + (item.cost * item.quantity), 0), [cart]);
    const taxAmount = Math.round(netTotal * 0.19);
    const totalWithTax = netTotal + taxAmount;

    // Handlers
    const handleAddToCart = (product: any) => {
        const existing = cart.find(i => i.sku === product.sku);
        if (existing) {
            setCart(cart.map(i => i.sku === product.sku ? { ...i, quantity: i.quantity + 1 } : i));
        } else {
            setCart([...cart, {
                sku: product.sku,
                name: product.name,
                quantity: 1,
                cost: product.cost_net || product.cost_price || 0
            }]);
        }
        toast.success(`Agregado: ${product.name}`);
        setSearchTerm(''); // Clear search for faster entry
    };

    const handleUpdateItem = (sku: string, field: 'quantity' | 'cost', value: number) => {
        if (value < 0) return;
        setCart(cart.map(i => i.sku === sku ? { ...i, [field]: value } : i));
    };

    const handleRemoveItem = (sku: string) => {
        setCart(cart.filter(i => i.sku !== sku));
    };

    const handleSaveOrder = (status: 'DRAFT' | 'SENT') => {
        if (!selectedSupplierId || cart.length === 0) return;

        const newOrder = {
            id: `PO-MAN-${Date.now()}`,
            supplier_id: selectedSupplierId,
            created_at: Date.now(),
            status: status, // DRAFT or SENT
            items: cart.map(i => ({
                sku: i.sku,
                name: i.name,
                quantity: i.quantity,
                cost_price: i.cost
            })),
            total_estimated: netTotal
        };

        addPurchaseOrder(newOrder);

        if (status === 'SENT') {
            toast.success('Orden enviada al proveedor exitosamente');
        } else {
            toast.success('Borrador guardado');
        }

        onClose();
        // Reset
        setSelectedSupplierId('');
        setCart([]);
        setSearchTerm('');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">

                {/* HEADER - ZONE A */}
                <div className="bg-slate-900 p-6 text-white shrink-0 flex justify-between items-start">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-cyan-500/20 rounded-xl">
                            <ShoppingCart className="text-cyan-400" size={32} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold">Nueva Orden de Compra</h2>
                            <p className="text-slate-400 text-sm">Abastecimiento B2B • Creación Manual</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-2 hover:bg-white/10 rounded-full transition">
                        <X size={24} />
                    </button>
                </div>

                {/* MAIN CONTENT - SPLIT VIEW */}
                <div className="flex-1 flex overflow-hidden">

                    {/* LEFT PANEL: CONFIG & SEARCH */}
                    <div className="w-1/3 border-r border-slate-200 bg-slate-50 flex flex-col">

                        {/* ZONE A: SUPPLIER INFO */}
                        <div className="p-6 border-b border-slate-200 bg-white">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">1. Seleccionar Proveedor</label>
                            <select
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-cyan-500 outline-none transition"
                                value={selectedSupplierId}
                                onChange={(e) => setSelectedSupplierId(e.target.value)}
                            >
                                <option value="">-- Seleccione Proveedor --</option>
                                {suppliers.map(s => (
                                    <option key={s.id} value={s.id}>{s.fantasy_name}</option>
                                ))}
                            </select>

                            {selectedSupplier && (
                                <div className="mt-4 p-4 bg-cyan-50 rounded-xl border border-cyan-100">
                                    <div className="flex items-center gap-2 text-cyan-800 font-bold mb-2">
                                        <Building2 size={16} /> {selectedSupplier.fantasy_name}
                                    </div>
                                    <div className="space-y-1 text-xs text-cyan-700">
                                        <p>RUT: {selectedSupplier.rut}</p>
                                        <p>Email: {selectedSupplier.contact_email}</p>
                                        <p>Días Crédito: {selectedSupplier.payment_terms === 'CONTADO' ? '0 (Contado)' : selectedSupplier.payment_terms.replace('_DIAS', '')}</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ZONE B: PRODUCT SEARCH */}
                        <div className="p-6 flex-1 flex flex-col overflow-hidden">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">2. Buscar Productos</label>
                            <div className="relative mb-4">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="text"
                                    placeholder="Nombre o SKU..."
                                    className="w-full pl-10 p-3 border border-slate-200 rounded-xl focus:border-cyan-500 outline-none shadow-sm"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    disabled={!selectedSupplierId}
                                />
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                {!selectedSupplierId ? (
                                    <div className="text-center py-10 text-slate-400 text-sm">
                                        Seleccione un proveedor para comenzar
                                    </div>
                                ) : filteredProducts.length === 0 && searchTerm ? (
                                    <div className="text-center py-10 text-slate-400 text-sm">
                                        No se encontraron productos
                                    </div>
                                ) : (
                                    filteredProducts.map(product => (
                                        <button
                                            key={product.id}
                                            onClick={() => handleAddToCart(product)}
                                            className="w-full p-3 bg-white rounded-xl border border-slate-200 hover:border-cyan-400 hover:shadow-md transition text-left group flex justify-between items-center"
                                        >
                                            <div className="min-w-0">
                                                <div className="font-bold text-slate-700 truncate group-hover:text-cyan-700">{product.name}</div>
                                                <div className="text-xs text-slate-500 flex gap-2">
                                                    <span>SKU: {product.sku}</span>
                                                    <span>Stock: {product.stock_actual}</span>
                                                </div>
                                            </div>
                                            <div className="text-cyan-600 bg-cyan-50 p-2 rounded-lg group-hover:bg-cyan-100">
                                                <Plus size={16} />
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT PANEL: CART & TOTALS */}
                    <div className="flex-1 flex flex-col bg-white">

                        {/* ZONE B: CART TABLE */}
                        <div className="flex-1 overflow-y-auto p-6">
                            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <Package className="text-cyan-600" /> Detalle de la Orden
                            </h3>

                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs sticky top-0 z-10">
                                    <tr>
                                        <th className="p-3 rounded-l-lg">Producto</th>
                                        <th className="p-3 text-right">Costo Unit.</th>
                                        <th className="p-3 text-center">Cant.</th>
                                        <th className="p-3 text-right">Subtotal</th>
                                        <th className="p-3 rounded-r-lg w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {cart.map(item => (
                                        <tr key={item.sku} className="hover:bg-slate-50 transition group">
                                            <td className="p-3">
                                                <div className="font-bold text-slate-700">{item.name}</div>
                                                <div className="text-xs text-slate-400">{item.sku}</div>
                                            </td>
                                            <td className="p-3 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <span className="text-slate-400">$</span>
                                                    <input
                                                        type="number"
                                                        className="w-20 text-right font-medium bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 outline-none"
                                                        value={item.cost}
                                                        onChange={(e) => handleUpdateItem(item.sku, 'cost', parseInt(e.target.value) || 0)}
                                                    />
                                                </div>
                                            </td>
                                            <td className="p-3 text-center">
                                                <input
                                                    type="number"
                                                    className="w-16 text-center font-bold bg-slate-100 rounded-lg py-1 border border-transparent focus:border-cyan-500 outline-none"
                                                    value={item.quantity}
                                                    onChange={(e) => handleUpdateItem(item.sku, 'quantity', parseInt(e.target.value) || 0)}
                                                />
                                            </td>
                                            <td className="p-3 text-right font-bold text-slate-700">
                                                ${(item.cost * item.quantity).toLocaleString()}
                                            </td>
                                            <td className="p-3 text-center">
                                                <button
                                                    onClick={() => handleRemoveItem(item.sku)}
                                                    className="text-slate-300 hover:text-red-500 transition"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {cart.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                                                Agregue productos desde el panel izquierdo
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* ZONE C: TOTALS & ACTIONS */}
                        <div className="p-6 bg-slate-50 border-t border-slate-200">
                            <div className="flex justify-end mb-6">
                                <div className="w-64 space-y-2">
                                    <div className="flex justify-between text-slate-500">
                                        <span>Neto</span>
                                        <span>${netTotal.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-slate-500">
                                        <span>IVA (19%)</span>
                                        <span>${taxAmount.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-xl font-bold text-slate-900 pt-2 border-t border-slate-200">
                                        <span>Total</span>
                                        <span>${totalWithTax.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => handleSaveOrder('DRAFT')}
                                    disabled={cart.length === 0}
                                    className="px-6 py-3 bg-white border border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition flex items-center gap-2 disabled:opacity-50"
                                >
                                    <Save size={18} /> Guardar Borrador
                                </button>
                                <button
                                    onClick={() => handleSaveOrder('SENT')}
                                    disabled={cart.length === 0}
                                    className="px-6 py-3 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-700 shadow-lg shadow-cyan-200 transition flex items-center gap-2 disabled:opacity-50"
                                >
                                    <Send size={18} /> Guardar y Enviar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ManualOrderModal;
