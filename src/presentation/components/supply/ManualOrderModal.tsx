import React, { useState, useMemo, useEffect } from 'react';
import { X, Search, Plus, Trash2, AlertTriangle, Save, Send, DollarSign, Calendar, Truck, Package } from 'lucide-react';
import { usePharmaStore } from '../../store/useStore';
import { useNotificationStore } from '../../store/useNotificationStore';
import { toast } from 'sonner';
import { InventoryBatch, PurchaseOrder, PurchaseOrderItem } from '../../../domain/types';
import { createNotificationSecure } from '../../../actions/notifications-v2';
import { createPurchaseOrderSecure, updatePurchaseOrderSecure } from '../../../actions/supply-v2';
import { updatePriceSecure } from '../../../actions/products-v2';

interface ManualOrderModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialOrder?: PurchaseOrder | null;
}

interface OrderItem {
    productId?: string;
    sku: string;
    name: string;
    quantity: number;
    cost_price: number; // Net Cost
    sale_price: number;
    stock_actual: number;
    stock_max: number;
    original_cost?: number; // To track changes
    suggestedSupplierId?: string;
}

const ManualOrderModal: React.FC<ManualOrderModalProps> = ({ isOpen, onClose, initialOrder }) => {
    const { inventory, suppliers, addPurchaseOrder, updatePurchaseOrder, user, currentWarehouseId, currentLocationId } = usePharmaStore();

    const [selectedSupplierId, setSelectedSupplierId] = useState('');
    const [customOrderId, setCustomOrderId] = useState('');
    const [expectedDate, setExpectedDate] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
    const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
    const [isSaving, setIsSaving] = useState(false);

    // Helper to generate readable ID
    const generateReadableId = () => {
        const now = new Date();
        const d = String(now.getDate()).padStart(2, '0');
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const y = now.getFullYear();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        return `OC-${d}${m}${y}-${hh}${mm}`;
    };

    // Initialize state when initialOrder changes or modal opens
    useEffect(() => {
        if (isOpen) {
            if (initialOrder) {
                // Edit Mode
                setSelectedSupplierId(initialOrder.supplier_id || '');
                setCustomOrderId(initialOrder.id);
                // Map existing items to OrderItem format
                const mappedItems: OrderItem[] = initialOrder.items.map(item => {
                    // Try to find current stock info from inventory
                    const inventoryItem = inventory.find(i => i.sku === item.sku);
                    return {
                        productId: inventoryItem?.product_id || inventoryItem?.id, // Try to get master ID
                        sku: item.sku,
                        name: item.name,
                        quantity: item.quantity_ordered || 0, // Ensure default
                        cost_price: item.cost_price || 0,
                        sale_price: inventoryItem?.price_sell_unit || inventoryItem?.price || 0,
                        stock_actual: inventoryItem?.stock_actual || 0,
                        stock_max: inventoryItem?.stock_max || 100,
                        original_cost: item.cost_price || 0,
                        suggestedSupplierId: initialOrder.supplier_id || undefined
                    };
                });
                setOrderItems(mappedItems);
                setSelectedSkus(new Set(mappedItems.map(i => i.sku)));
            } else {
                // Create Mode (Reset)
                setSelectedSupplierId('');
                setCustomOrderId(generateReadableId());
                setOrderItems([]);
                setSelectedSkus(new Set());
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
            productId: product.product_id || product.id,
            sku: product.sku,
            name: product.name,
            quantity: 1,
            cost_price: product.cost_price || product.cost_net || 0,
            sale_price: product.price_sell_unit || product.price || 0,
            stock_actual: product.stock_actual,
            stock_max: product.stock_max || 100, // Default max if not set
            original_cost: product.cost_price || product.cost_net || 0
        }]);
        setSelectedSkus(prev => {
            const next = new Set(prev);
            next.add(product.sku);
            return next;
        });
        setSearchTerm('');
    };

    const updateItem = (sku: string, field: keyof OrderItem, value: any) => {
        // Allow empty string for inputs while typing
        const refinedValue = value === '' ? 0 : parseFloat(value);

        setOrderItems(items => items.map(item =>
            item.sku === sku ? { ...item, [field]: isNaN(refinedValue) ? 0 : refinedValue } : item
        ));
    };

    const removeItem = (sku: string) => {
        setOrderItems(items => items.filter(i => i.sku !== sku));
    };

    const totals = useMemo(() => {
        // Calculate totals by summing individual line items to ensure visual consistency
        // Logic: 
        // 1. Calculate Unit VAT = Round(Cost * 0.19)
        // 2. Calculate Unit Gross = Cost + VAT
        // 3. Line Net = Cost * Qty
        // 4. Line VAT = Unit VAT * Qty
        // 5. Line Gross = Unit Gross * Qty

        let netTotal = 0;
        let vatTotal = 0;
        let grossTotal = 0;
        let retailTotal = 0;

        orderItems.forEach(item => {
            const qty = item.quantity || 0;
            const cost = item.cost_price || 0;

            const unitVat = Math.round(cost * 0.19);
            const unitGross = cost + unitVat;

            netTotal += cost * qty;
            vatTotal += unitVat * qty;
            grossTotal += unitGross * qty;
            retailTotal += (item.sale_price || 0) * qty;
        });

        return { net: netTotal, tax: vatTotal, total: grossTotal, retail: retailTotal };
    }, [orderItems]);

    const handleSave = async (status: 'DRAFT' | 'SENT') => {
        if (orderItems.length === 0) {
            toast.error('Agregue productos a la orden');
            return;
        }
        if (!user?.id) {
            toast.error('Sesión inválida');
            return;
        }

        setIsSaving(true);
        const updates: Promise<any>[] = [];

        // 1. Check for Cost Updates
        for (const item of orderItems) {
            // Only update if cost changed, has productId, and is a valid cost
            if (item.productId && item.cost_price !== item.original_cost && item.cost_price >= 0) {
                console.log(`⚡️ Auto-updating Master Cost for ${item.sku}: $${item.original_cost} -> $${item.cost_price}`);

                updates.push(
                    updatePriceSecure({
                        productId: item.productId,
                        newPrice: item.sale_price || 0, // Keep sale price same
                        newCostPrice: item.cost_price,
                        reason: `Actualización costo desde OC Manual ${status === 'DRAFT' ? '(Borrador)' : ''}`,
                        userId: user.id
                    }).then(res => {
                        if (!res.success) {
                            console.warn(`Failed to update cost for ${item.sku}:`, res.error);
                            // We don't block the order save, just log warning
                        }
                        return res;
                    })
                );
            }
        }

        // Wait for all cost updates (Non-blocking UI ideally, but safer to await for consistency)
        if (updates.length > 0) {
            toast.info(`Actualizando costos maestros de ${updates.length} productos...`);
            await Promise.allSettled(updates);
        }

        // 2. Persist to Database (Only selected items)
        const activeItems = orderItems.filter(i => selectedSkus.has(i.sku));

        if (activeItems.length === 0) {
            toast.error('Debe seleccionar al menos un producto para la orden');
            setIsSaving(false);
            return;
        }

        const dbPayload = {
            id: customOrderId,
            supplierId: selectedSupplierId || null,
            targetWarehouseId: currentWarehouseId || '98d9ccca-583d-4720-9993-4fd73347e834', // Usar store o hardcoded como último recurso
            items: activeItems.map(i => ({
                sku: i.sku,
                name: i.name,
                quantity: i.quantity || 0,
                cost: i.cost_price || 0,
                productId: i.productId || null
            })),
            notes: `Orden Manual - ${new Date().toLocaleDateString('es-CL')}${selectedSupplierId ? '' : ' (Proveedor Pendiente)'}`,
            status: (status === 'SENT' ? 'APPROVED' : 'DRAFT') as 'DRAFT' | 'APPROVED'
        };

        try {
            let serverOrderId: string | undefined;
            if (initialOrder) {
                const result = await updatePurchaseOrderSecure(initialOrder.id, dbPayload, user.id);
                if (!result.success) {
                    toast.error(result.error || 'Error desconocido al actualizar');
                    setIsSaving(false);
                    return;
                }
                serverOrderId = initialOrder.id;
            } else {
                const result = await createPurchaseOrderSecure(dbPayload, user.id);
                if (!result.success) {
                    toast.error(result.error || 'Error desconocido al crear');
                    setIsSaving(false);
                    return;
                }
                serverOrderId = result.orderId;
            }

            // 3. Update local state (Zustand) for UI immediacy
            const orderData = {
                supplier_id: selectedSupplierId,
                supplier_name: selectedSupplier?.fantasy_name,
                target_warehouse_id: currentWarehouseId || '98d9ccca-583d-4720-9993-4fd73347e834',
                destination_location_id: currentLocationId || 'BODEGA_CENTRAL',
                status: (status === 'SENT' ? 'APPROVED' : 'DRAFT') as any,
                items: orderItems.map(i => ({
                    sku: i.sku,
                    name: i.name,
                    quantity_ordered: i.quantity || 0,
                    quantity_received: 0,
                    cost_price: i.cost_price || 0,
                    quantity: i.quantity || 0
                })),
                total_estimated: totals.total,
                updated_at: Date.now()
            };

            if (initialOrder) {
                updatePurchaseOrder(initialOrder.id, orderData);
                toast.success(status === 'SENT' ? 'Orden enviada correctamente' : 'Borrador actualizado en nube');
            } else {
                const newOrder: PurchaseOrder = {
                    id: serverOrderId || `ORD-${Date.now()}`,
                    created_at: Date.now(),
                    is_auto_generated: false,
                    generation_reason: 'MANUAL',
                    ...orderData
                };
                addPurchaseOrder(newOrder);
                toast.success(status === 'SENT' ? 'Orden creada y enviada' : 'Borrador persistido en nube');
            }
        } catch (error) {
            console.error('Failed to save to DB', error);
            toast.error('Error crítico al conectar con el servidor');
            setIsSaving(false);
            return;
        }

        if (status === 'SENT') {
            try {
                // Call server action for notification
                await createNotificationSecure({
                    type: 'INVENTORY',
                    severity: 'INFO',
                    title: initialOrder ? 'Orden Actualizada y Enviada' : 'Orden de Compra Enviada',
                    message: `Orden ${initialOrder?.id || 'Nueva'} enviada a ${selectedSupplier?.fantasy_name}`,
                    metadata: {
                        orderId: initialOrder?.id,
                        supplier: selectedSupplier?.fantasy_name,
                        roleTarget: 'MANAGER'
                    }
                });
            } catch (error) {
                console.error('Failed to send notification', error);
            }
        }

        setIsSaving(false);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-gray-50 rounded-t-2xl">
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                                <Plus className="text-cyan-600" />
                                {initialOrder ? 'Editar Orden' : 'Nueva Orden'}
                            </h2>
                            <input
                                type="text"
                                value={customOrderId}
                                onChange={(e) => setCustomOrderId(e.target.value)}
                                placeholder="ID de la Orden"
                                className="text-xl font-bold text-cyan-700 bg-transparent border-b-2 border-transparent hover:border-cyan-200 focus:border-cyan-500 focus:outline-none px-2 transition-all"
                            />
                        </div>
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
                    <div className="w-[300px] flex-shrink-0 border-r border-gray-100 p-5 flex flex-col gap-5 bg-white overflow-y-auto">
                        {/* Supplier Selection */}
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700">Proveedor</label>
                            <select
                                value={selectedSupplierId}
                                onChange={(e) => setSelectedSupplierId(e.target.value)}
                                className="w-full p-3 border border-gray-200 rounded-xl focus:border-cyan-500 focus:outline-none bg-gray-50"
                            >
                                <option value="">Por definir / Después</option>
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
                                <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden shadow-lg z-10 relative bg-white">
                                    {searchResults.map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => handleAddItem(item)}
                                            className="w-full p-3 text-left hover:bg-cyan-50 border-b border-gray-100 last:border-0 transition flex justify-between items-center group"
                                        >
                                            <div>
                                                <div className="font-bold text-gray-800 truncate max-w-[180px]">{item.name}</div>
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
                    <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
                        <div className="flex-1 overflow-auto p-4">
                            {orderItems.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                    <Package size={64} className="mb-4 opacity-50" />
                                    <p className="text-lg font-medium">El carrito de compra está vacío</p>
                                    <p className="text-sm">Seleccione un proveedor y agregue productos</p>
                                </div>
                            ) : (
                                <table className="w-full text-left border-separate border-spacing-y-2">
                                    <thead>
                                        {/* Quick Filter Bar */}
                                        {orderItems.some(i => i.suggestedSupplierId) && (
                                            <tr>
                                                <th colSpan={8} className="px-2 py-2">
                                                    <div className="flex gap-2 items-center text-[10px] text-gray-500 font-medium">
                                                        <span>Selección rápida:</span>
                                                        <button
                                                            onClick={() => setSelectedSkus(new Set(orderItems.map(i => i.sku)))}
                                                            className="px-2 py-0.5 bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                                                        >
                                                            Todos
                                                        </button>
                                                        <button
                                                            onClick={() => setSelectedSkus(new Set())}
                                                            className="px-2 py-0.5 bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                                                        >
                                                            Ninguno
                                                        </button>
                                                        {selectedSupplierId && (
                                                            <button
                                                                onClick={() => {
                                                                    const supplierSkus = orderItems.filter(i => i.suggestedSupplierId === selectedSupplierId).map(i => i.sku);
                                                                    setSelectedSkus(prev => new Set([...Array.from(prev), ...supplierSkus]));
                                                                }}
                                                                className="px-2 py-0.5 bg-cyan-100 text-cyan-700 hover:bg-cyan-200 rounded transition-colors"
                                                            >
                                                                Solo {selectedSupplier?.fantasy_name || 'este proveedor'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </th>
                                            </tr>
                                        )}
                                        <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                                            <th className="px-2 py-2">Producto</th>
                                            <th className="px-2 py-2 w-8">
                                                <input
                                                    type="checkbox"
                                                    checked={orderItems.length > 0 && selectedSkus.size === orderItems.length}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setSelectedSkus(new Set(orderItems.map(i => i.sku)));
                                                        else setSelectedSkus(new Set());
                                                    }}
                                                    className="w-4 h-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                                                />
                                            </th>
                                            <th className="px-2 py-2 text-center w-20">Cant.</th>
                                            <th className="px-2 py-2 text-right w-32">Costo Neto (Unit)</th>
                                            <th className="px-2 py-2 text-right w-24">IVA</th>
                                            <th className="px-2 py-2 text-right w-28">Bruto</th>
                                            <th className="px-2 py-2 text-right w-28">Margen</th>
                                            <th className="px-2 py-2 text-right w-36">Subtotal</th>
                                            <th className="px-2 py-2 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {orderItems.map(item => {
                                            const qty = item.quantity || 0;
                                            const netCost = item.cost_price || 0;
                                            const unitVat = Math.round(netCost * 0.19);
                                            const unitGross = netCost + unitVat;
                                            const subtotal = unitGross * qty;

                                            // Margin calculation based on RETAIL PRICE vs NEW GROSS COST
                                            const margin = item.sale_price > 0
                                                ? ((item.sale_price - unitGross) / item.sale_price) * 100
                                                : 0;

                                            return (
                                                <tr key={item.sku} className={`bg-white shadow-sm rounded-xl hover:shadow-md transition-all ${!selectedSkus.has(item.sku) ? 'opacity-60 grayscale-[0.5]' : ''}`}>
                                                    <td className="px-2 py-3 rounded-l-xl">
                                                        <div className="flex items-center gap-3">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedSkus.has(item.sku)}
                                                                onChange={() => {
                                                                    setSelectedSkus(prev => {
                                                                        const next = new Set(prev);
                                                                        if (next.has(item.sku)) next.delete(item.sku);
                                                                        else next.add(item.sku);
                                                                        return next;
                                                                    });
                                                                }}
                                                                className="w-4 h-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                                                            />
                                                            <div className="flex-1">
                                                                <div className="font-bold text-gray-800 text-xs line-clamp-1" title={item.name}>{item.name}</div>
                                                                <div className="text-[9px] font-mono text-gray-400">{item.sku}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-2 py-3 text-center">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={item.quantity === 0 ? '' : item.quantity}
                                                            onChange={(e) => updateItem(item.sku, 'quantity', e.target.value)}
                                                            className="w-full p-1.5 text-center border border-gray-200 rounded-lg font-bold text-sm focus:border-cyan-500 focus:outline-none"
                                                            placeholder="0"
                                                        />
                                                    </td>
                                                    <td className="px-2 py-3 text-right">
                                                        <div className="relative">
                                                            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-300 text-[10px]">$</span>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                value={item.cost_price === 0 ? '' : item.cost_price}
                                                                onChange={(e) => updateItem(item.sku, 'cost_price', e.target.value)}
                                                                className="w-full p-1.5 pr-1 text-right border border-gray-200 rounded-lg font-mono text-xs focus:border-cyan-500 focus:outline-none"
                                                                placeholder="0"
                                                            />
                                                        </div>
                                                    </td>
                                                    <td className="px-2 py-3 text-right text-[11px] text-gray-400 font-mono">
                                                        ${unitVat.toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                                                    </td>
                                                    <td className="px-2 py-3 text-right font-bold text-gray-600 font-mono text-[11px]">
                                                        ${unitGross.toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                                                    </td>
                                                    <td className="px-2 py-3 text-right">
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-[9px] text-gray-400 whitespace-nowrap">
                                                                V: ${item.sale_price.toLocaleString()}
                                                            </span>
                                                            <span className={`text-[10px] font-bold px-1 py-0 rounded ${margin < 30 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                                                {margin.toFixed(1)}%
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-2 py-3 text-right font-black text-gray-800 text-sm">
                                                        ${subtotal.toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                                                    </td>
                                                    <td className="p-4 rounded-r-xl text-center">
                                                        <button
                                                            onClick={() => removeItem(item.sku)}
                                                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Totals Footer */}
                        <div className="p-6 bg-white border-t border-gray-200">
                            <div className="flex justify-end items-center gap-8 mb-6">
                                <div className="text-right">
                                    <p className="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold">Neto Total</p>
                                    <p className="text-xl font-bold text-gray-700">${totals.net.toLocaleString()}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold">IVA Total</p>
                                    <p className="text-xl font-bold text-gray-700">${totals.tax.toLocaleString()}</p>
                                </div>
                                <div className="h-10 w-px bg-gray-200"></div>
                                <div className="text-right">
                                    <p className="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold">Total a Pagar</p>
                                    <p className="text-4xl font-black text-cyan-600">${totals.total.toLocaleString()}</p>
                                </div>
                            </div>

                            <div className="flex justify-end gap-4">
                                <button
                                    onClick={() => handleSave('DRAFT')}
                                    disabled={isSaving}
                                    className="px-6 py-3 text-gray-600 font-bold hover:bg-gray-100 rounded-xl transition flex items-center gap-2 disabled:opacity-50"
                                >
                                    <Save size={20} />
                                    {isSaving ? 'Guardando...' : (initialOrder ? 'Actualizar Borrador' : 'Guardar Borrador')}
                                </button>
                                <button
                                    onClick={() => handleSave('SENT')}
                                    disabled={isSaving}
                                    className="px-8 py-3 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-700 transition shadow-lg shadow-cyan-200 flex items-center gap-2 disabled:opacity-50"
                                >
                                    <Send size={20} />
                                    {isSaving ? 'Enviando...' : 'Confirmar y Enviar'}
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
