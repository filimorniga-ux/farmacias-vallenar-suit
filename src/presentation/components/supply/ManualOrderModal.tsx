import React, { useState, useMemo, useEffect } from 'react';
import { X, Search, Plus, Trash2, AlertTriangle, Save, Send, DollarSign, Calendar, Truck, Package } from 'lucide-react';
import { usePharmaStore } from '../../store/useStore';
import { useNotificationStore } from '../../store/useNotificationStore';
import { toast } from 'sonner';
import { InventoryBatch, PurchaseOrder, PurchaseOrderItem } from '../../../domain/types';

interface ManualOrderModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialOrder?: PurchaseOrder | null;
}

interface OrderItem {
    sku: string;
    name: string;
    quantity: number;
    cost_price: number;
    sale_price: number;
    stock_actual: number;
    stock_max: number;
}

const ManualOrderModal: React.FC<ManualOrderModalProps> = ({ isOpen, onClose, initialOrder }) => {
    const { inventory, suppliers, addPurchaseOrder, updatePurchaseOrder } = usePharmaStore();
    const { pushNotification } = useNotificationStore();

    const [selectedSupplierId, setSelectedSupplierId] = useState('');
    const [expectedDate, setExpectedDate] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

    // Initialize state when initialOrder changes or modal opens
    useEffect(() => {
        if (isOpen) {
            if (initialOrder) {
                // Edit Mode
                setSelectedSupplierId(initialOrder.supplier_id);
                // Map existing items to OrderItem format
                const mappedItems: OrderItem[] = initialOrder.items.map(item => {
                    // Try to find current stock info from inventory
                    const inventoryItem = inventory.find(i => i.sku === item.sku);
                    return {
                        sku: item.sku,
                        name: item.name,
                        quantity: item.quantity_ordered,
                        cost_price: item.cost_price,
                        sale_price: inventoryItem?.price_sell_unit || inventoryItem?.price || 0,
                        stock_actual: inventoryItem?.stock_actual || 0,
                        stock_max: inventoryItem?.stock_max || 100
                    };
                });
                setOrderItems(mappedItems);
            } else {
                // Create Mode (Reset)
                setSelectedSupplierId('');
                setOrderItems([]);
                setExpectedDate('');
            }
        }
    }, [isOpen, initialOrder, inventory]);

    const selectedSupplier = useMemo(() =>
        suppliers.find(s => s.id === selectedSupplierId),
        [selectedSupplierId, suppliers]);

    const searchResults = useMemo(() => {
        if (!searchTerm) return [];
        return inventory.filter(item =>
            item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.sku.includes(searchTerm)
        ).slice(0, 5);
    }, [searchTerm, inventory]);

    const handleAddItem = (product: InventoryBatch) => {
        if (orderItems.find(i => i.sku === product.sku)) {
            toast.error('El producto ya está en la orden');
            return;
        }

        setOrderItems([...orderItems, {
            sku: product.sku,
            name: product.name,
            quantity: 1,
            cost_price: product.cost_price || 0,
            sale_price: product.price_sell_unit || product.price || 0,
            stock_actual: product.stock_actual,
            stock_max: product.stock_max || 100 // Default max if not set
        }]);
        setSearchTerm('');
    };

    const updateItem = (sku: string, field: keyof OrderItem, value: number) => {
        setOrderItems(items => items.map(item =>
            item.sku === sku ? { ...item, [field]: value } : item
        ));
    };

    const removeItem = (sku: string) => {
        setOrderItems(items => items.filter(i => i.sku !== sku));
    };

    const totals = useMemo(() => {
        const net = orderItems.reduce((acc, item) => acc + (item.quantity * item.cost_price), 0);
        const retail = orderItems.reduce((acc, item) => acc + (item.quantity * (item.sale_price || 0)), 0);
        const tax = net * 0.19;
        return { net, tax, total: net + tax, retail };
    }, [orderItems]);

    const handleSave = (status: 'DRAFT' | 'SENT') => {
        if (!selectedSupplierId) {
            toast.error('Seleccione un proveedor');
            return;
        }
        if (orderItems.length === 0) {
            toast.error('Agregue productos a la orden');
            return;
        }

        const orderData = {
            supplier_id: selectedSupplierId,
            supplier_name: selectedSupplier?.fantasy_name,
            destination_location_id: 'BODEGA_CENTRAL',
            status,
            items: orderItems.map(i => ({
                sku: i.sku,
                name: i.name,
                quantity_ordered: i.quantity,
                quantity_received: 0,
                cost_price: i.cost_price,
                quantity: i.quantity // Legacy compatibility
            })),
            total_estimated: totals.total,
            updated_at: Date.now() // Track updates
        };

        if (initialOrder) {
            // UPDATE EXISTING
            updatePurchaseOrder(initialOrder.id, orderData);
            toast.success(status === 'SENT' ? 'Orden actualizada y enviada' : 'Borrador actualizado');
        } else {
            // CREATE NEW
            const newOrder: PurchaseOrder = {
                id: `ORD-${Date.now()}`,
                created_at: Date.now(),
                is_auto_generated: false,
                generation_reason: 'MANUAL',
                ...orderData
            };
            addPurchaseOrder(newOrder);
            toast.success(status === 'SENT' ? 'Orden creada y enviada' : 'Borrador guardado');
        }

        if (status === 'SENT') {
            pushNotification({
                eventType: 'AUTO_ORDER_GENERATED',
                category: 'STOCK',
                severity: 'INFO',
                title: initialOrder ? 'Orden Actualizada y Enviada' : 'Orden de Compra Enviada',
                message: `Orden ${initialOrder?.id || 'Nueva'} enviada a ${selectedSupplier?.fantasy_name}`,
                roleTarget: 'MANAGER'
            });
        }

        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-gray-50 rounded-t-2xl">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                            <Plus className="text-cyan-600" />
                            {initialOrder ? `Editar Orden ${initialOrder.id}` : 'Nueva Orden Manual'}
                        </h2>
                        <p className="text-sm text-gray-500">
                            {initialOrder ? 'Modificación de borrador existente' : 'Creación de pedido discrecional'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <X size={24} className="text-gray-500" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left: Configuration & Search */}
                    <div className="w-1/3 border-r border-gray-100 p-6 flex flex-col gap-6 bg-white overflow-y-auto">
                        {/* Supplier Selection */}
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700">Proveedor</label>
                            <select
                                value={selectedSupplierId}
                                onChange={(e) => setSelectedSupplierId(e.target.value)}
                                className="w-full p-3 border border-gray-200 rounded-xl focus:border-cyan-500 focus:outline-none bg-gray-50"
                                disabled={!!initialOrder} // Disable supplier change on edit to avoid complexity
                            >
                                <option value="">Seleccione un proveedor...</option>
                                {suppliers.map(s => (
                                    <option key={s.id} value={s.id}>{s.fantasy_name}</option>
                                ))}
                            </select>
                            {selectedSupplier && (
                                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-sm">
                                    <div className="flex justify-between mb-1">
                                        <span className="text-blue-600 font-bold">Condición:</span>
                                        <span className="text-blue-800">{selectedSupplier.payment_terms} días</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-blue-600 font-bold">Crédito:</span>
                                        <span className="text-blue-800">$5.000.000 (Disp)</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Date */}
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700">Fecha Esperada</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="date"
                                    value={expectedDate}
                                    onChange={(e) => setExpectedDate(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:border-cyan-500 focus:outline-none"
                                />
                            </div>
                        </div>

                        {/* Product Search */}
                        <div className="space-y-2 flex-1">
                            <label className="text-sm font-bold text-gray-700">Agregar Productos</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="text"
                                    placeholder="Buscar por SKU o Nombre..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:border-cyan-500 focus:outline-none"
                                />
                            </div>

                            {/* Search Results */}
                            {searchTerm && (
                                <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden shadow-lg">
                                    {searchResults.map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => handleAddItem(item)}
                                            className="w-full p-3 text-left hover:bg-cyan-50 border-b border-gray-100 last:border-0 transition flex justify-between items-center group"
                                        >
                                            <div>
                                                <div className="font-bold text-gray-800">{item.name}</div>
                                                <div className="text-xs text-gray-500">{item.sku} • Stock: {item.stock_actual}</div>
                                            </div>
                                            <Plus size={18} className="text-gray-300 group-hover:text-cyan-600" />
                                        </button>
                                    ))}
                                    {searchResults.length === 0 && (
                                        <div className="p-4 text-center text-gray-400 text-sm">No se encontraron productos</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Order Grid */}
                    <div className="flex-1 flex flex-col bg-gray-50">
                        <div className="flex-1 overflow-auto p-6">
                            {orderItems.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                    <Package size={64} className="mb-4 opacity-50" />
                                    <p className="text-lg font-medium">El carrito de compra está vacío</p>
                                    <p className="text-sm">Seleccione un proveedor y agregue productos</p>
                                </div>
                            ) : (
                                <table className="w-full text-left border-separate border-spacing-y-2">
                                    <thead>
                                        <tr className="text-xs font-bold text-gray-500 uppercase">
                                            <th className="px-4">Producto</th>
                                            <th className="px-4 text-center">Cantidad</th>
                                            <th className="px-4 text-right">Costo / Venta Unit.</th>
                                            <th className="px-4 text-right">Subtotal (Costo / Venta)</th>
                                            <th className="px-4"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {orderItems.map(item => (
                                            <tr key={item.sku} className="bg-white shadow-sm rounded-xl">
                                                <td className="p-4 rounded-l-xl">
                                                    <div className="font-bold text-gray-800">{item.name}</div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-xs font-mono text-gray-400">{item.sku}</span>
                                                        <span className="text-xs text-green-600 bg-green-50 px-1 rounded">
                                                            Venta: ${item.sale_price?.toLocaleString()}
                                                        </span>
                                                        {item.stock_actual > item.stock_max && (
                                                            <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                                                                <AlertTriangle size={10} /> SOBRESTOCK
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={item.quantity}
                                                        onChange={(e) => updateItem(item.sku, 'quantity', parseInt(e.target.value) || 0)}
                                                        className="w-20 p-2 text-center border border-gray-200 rounded-lg font-bold focus:border-cyan-500 focus:outline-none"
                                                    />
                                                </td>
                                                <td className="p-4 text-right">
                                                    <div className="flex flex-col items-end gap-1">
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                value={item.cost_price}
                                                                onChange={(e) => updateItem(item.sku, 'cost_price', parseInt(e.target.value) || 0)}
                                                                className="w-24 p-2 pl-6 text-right border border-gray-200 rounded-lg font-mono text-sm focus:border-cyan-500 focus:outline-none"
                                                            />
                                                        </div>
                                                        <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full">
                                                            V: ${item.sale_price?.toLocaleString()}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-right">
                                                    <div className="flex flex-col items-end">
                                                        <span className="font-bold text-gray-800">
                                                            ${(item.quantity * item.cost_price).toLocaleString()}
                                                        </span>
                                                        <span className="text-sm font-bold text-green-600">
                                                            ${(item.quantity * (item.sale_price || 0)).toLocaleString()}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="p-4 rounded-r-xl text-center">
                                                    <button
                                                        onClick={() => removeItem(item.sku)}
                                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Totals Footer */}
                        <div className="p-6 bg-white border-t border-gray-200">
                            <div className="flex justify-end gap-12 mb-6">
                                <div className="text-right">
                                    <p className="text-sm text-gray-500 mb-1">Neto</p>
                                    <p className="text-xl font-bold text-gray-800">${totals.net.toLocaleString()}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm text-gray-500 mb-1">IVA (19%)</p>
                                    <p className="text-xl font-bold text-gray-800">${totals.tax.toLocaleString()}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm text-gray-500 mb-1">Total a Pagar</p>
                                    <p className="text-3xl font-extrabold text-cyan-600">${totals.total.toLocaleString()}</p>
                                </div>
                                <div className="text-right pl-6 border-l border-gray-200">
                                    <p className="text-sm text-gray-500 mb-1">Total Venta (Est.)</p>
                                    <p className="text-xl font-bold text-green-600">${totals.retail.toLocaleString()}</p>
                                </div>
                            </div>

                            <div className="flex justify-end gap-4">
                                <button
                                    onClick={() => handleSave('DRAFT')}
                                    className="px-6 py-3 text-gray-600 font-bold hover:bg-gray-100 rounded-xl transition flex items-center gap-2"
                                >
                                    <Save size={20} />
                                    {initialOrder ? 'Actualizar Borrador' : 'Guardar Borrador'}
                                </button>
                                <button
                                    onClick={() => handleSave('SENT')}
                                    className="px-8 py-3 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-700 transition shadow-lg shadow-cyan-200 flex items-center gap-2"
                                >
                                    <Send size={20} />
                                    Confirmar y Enviar
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
