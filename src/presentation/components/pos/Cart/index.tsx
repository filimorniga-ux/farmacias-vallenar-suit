/**
 * Cart Component
 * 
 * Modular shopping cart display for POS system
 * Features: desktop table view, mobile list view, quantity controls
 * 
 * @version 1.0.0
 */

'use client';

import React from 'react';
import { Minus, Plus, Trash2, Tag, Scissors } from 'lucide-react';
import { CartItem, InventoryBatch } from '../../../../domain/types';
import { usePharmaStore } from '../../../store/useStore';
import { formatProductLabel } from '../../../../domain/logic/productDisplay';

interface CartProps {
    items: CartItem[];
    inventory: InventoryBatch[];
    onFractionate: (item: CartItem) => void;
    className?: string;
}

export function Cart({ items, inventory, onFractionate, className = '' }: CartProps) {
    const { updateCartItemQuantity, removeFromCart } = usePharmaStore();

    if (items.length === 0) {
        return <CartEmptyState className={className} />;
    }

    return (
        <div className={`space-y-3 ${className}`}>
            {/* Desktop Table View */}
            <DesktopCartTable
                items={items}
                inventory={inventory}
                onQuantityChange={updateCartItemQuantity}
                onRemove={removeFromCart}
                onFractionate={onFractionate}
            />

            {/* Mobile List View */}
            <MobileCartList
                items={items}
                inventory={inventory}
                onQuantityChange={updateCartItemQuantity}
                onRemove={removeFromCart}
                onFractionate={onFractionate}
            />
        </div>
    );
}

// Desktop Table View
interface CartTableProps {
    items: CartItem[];
    inventory: InventoryBatch[];
    onQuantityChange: (itemId: string, quantity: number) => void;
    onRemove: (itemId: string) => void;
}

function DesktopCartTable({ items, inventory, onQuantityChange, onRemove, onFractionate }: CartTableProps & { onFractionate: (item: CartItem) => void }) {
    return (
        <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs border-b border-slate-200">
                        <th className="py-2 px-3 font-bold w-[50%]">Producto</th>
                        <th className="py-2 px-3 font-bold w-[15%] text-center">Cant.</th>
                        <th className="py-2 px-3 font-bold w-[15%] text-right">Precio</th>
                        <th className="py-2 px-3 font-bold w-[20%] text-right">Total</th>
                        <th className="py-2 px-3 font-bold text-center"></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                    {items.map((item) => (
                        <CartTableRow
                            key={item.id}
                            item={item}
                            fullItem={inventory.find(i => i.id === item.batch_id || i.id === item.id)}
                            onQuantityChange={onQuantityChange}
                            onRemove={onRemove}
                            onFractionate={onFractionate}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// Table Row
interface CartTableRowProps {
    item: CartItem;
    fullItem?: InventoryBatch;
    onQuantityChange: (itemId: string, quantity: number) => void;
    onRemove: (itemId: string) => void;
}

function CartTableRow({ item, fullItem, onQuantityChange, onRemove, onFractionate }: CartTableRowProps & { onFractionate: (item: CartItem) => void }) {
    const hasDiscount = !!(item as any).discount;
    const discount = (item as any).discount;

    return (
        <tr className="hover:bg-slate-50 transition-colors group">
            <td className="py-1 px-3">
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 text-sm leading-tight line-clamp-2">
                            {fullItem ? formatProductLabel(fullItem) : item.name}
                        </span>
                        {!item.is_fractional && (
                            <button
                                onClick={() => onFractionate(item)}
                                className="p-1 text-blue-500 hover:bg-blue-50 rounded transition-colors"
                                title="Fraccionar este producto"
                            >
                                <Scissors size={14} />
                            </button>
                        )}
                    </div>
                    {hasDiscount && (
                        <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full w-fit mt-0.5 flex items-center gap-1">
                            <Tag size={10} /> OFERTA
                        </span>
                    )}
                </div>
            </td>
            <td className="py-1 px-3">
                <QuantityControl
                    quantity={item.quantity}
                    onChange={(qty) => onQuantityChange(item.id, qty)}
                />
            </td>
            <td className="py-1 px-3 text-right">
                <span className="text-sm font-bold text-slate-600">
                    ${(item.price || 0).toLocaleString()}
                </span>
            </td>
            <td className="py-1 px-3 text-right">
                {hasDiscount ? (
                    <div className="flex flex-col items-end">
                        <span className="font-bold text-slate-800 text-lg">
                            ${(discount.finalPrice * item.quantity).toLocaleString()}
                        </span>
                        <span className="text-[10px] text-slate-400 line-through">
                            ${((item.price || 0) * item.quantity).toLocaleString()}
                        </span>
                        <span className="text-green-600 font-bold text-[10px]">
                            (-${(discount.discountAmount * item.quantity).toLocaleString()})
                        </span>
                    </div>
                ) : (
                    <span className="font-bold text-slate-800 text-lg">
                        ${((item.price || 0) * item.quantity).toLocaleString()}
                    </span>
                )}
            </td>
            <td className="py-1 px-3 text-center">
                <button
                    onClick={() => onRemove(item.id)}
                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Eliminar"
                    aria-label={`Eliminar ${item.name}`}
                >
                    <Trash2 size={16} />
                </button>
            </td>
        </tr>
    );
}

// Mobile List View
function MobileCartList({ items, inventory, onQuantityChange, onRemove, onFractionate }: CartTableProps & { onFractionate: (item: CartItem) => void }) {
    return (
        <div className="md:hidden space-y-3">
            {items.map((item) => (
                <MobileCartItem
                    key={item.id}
                    item={item}
                    fullItem={inventory.find(i => i.id === item.batch_id || i.id === item.id)}
                    onQuantityChange={onQuantityChange}
                    onRemove={onRemove}
                    onFractionate={onFractionate}
                />
            ))}
        </div>
    );
}

// Mobile Item
function MobileCartItem({ item, fullItem, onQuantityChange, onRemove, onFractionate }: CartTableRowProps & { onFractionate: (item: CartItem) => void }) {
    const hasDiscount = !!(item as any).discount;
    const discount = (item as any).discount;
    const finalPrice = hasDiscount ? discount.finalPrice : item.price || 0;

    return (
        <div className="flex justify-between items-center p-2 bg-white rounded-lg border border-slate-100 shadow-sm">
            <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-bold text-slate-800 text-sm line-clamp-1">
                        {fullItem ? formatProductLabel(fullItem) : item.name}
                    </h3>
                    {!item.is_fractional && (
                        <button
                            onClick={() => onFractionate(item)}
                            className="p-1 text-blue-500 hover:bg-blue-50 rounded transition-colors"
                        >
                            <Scissors size={14} />
                        </button>
                    )}
                    {hasDiscount && (
                        <span className="bg-purple-100 text-purple-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1">
                            <Tag size={9} /> OFERTA
                        </span>
                    )}
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                    <QuantityControlCompact
                        quantity={item.quantity}
                        onChange={(qty) => onQuantityChange(item.sku, qty)}
                    />
                    <span>x</span>
                    <span className="text-sm font-bold text-slate-700">
                        ${(item.price || 0).toLocaleString()}
                    </span>
                </div>
            </div>
            <div className="text-right mr-3">
                <p className="font-bold text-slate-800 text-base">
                    ${(finalPrice * item.quantity).toLocaleString()}
                </p>
            </div>
            <button
                onClick={() => onRemove(item.sku)}
                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                aria-label={`Eliminar ${item.name}`}
            >
                <Trash2 size={16} />
            </button>
        </div>
    );
}

// Quantity Controls
interface QuantityControlProps {
    quantity: number;
    onChange: (quantity: number) => void;
    min?: number;
}

function QuantityControl({ quantity, onChange, min = 1 }: QuantityControlProps) {
    return (
        <div className="flex items-center gap-0.5 w-fit mx-auto">
            <button
                onClick={() => onChange(quantity - 1)}
                className="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-md text-slate-600 disabled:opacity-50 border border-slate-200"
                disabled={quantity <= min}
                aria-label="Disminuir cantidad"
            >
                <Minus size={12} />
            </button>
            <input
                type="number"
                value={quantity}
                onChange={(e) => onChange(parseInt(e.target.value) || min)}
                className="w-10 h-6 text-center bg-white font-bold text-sm border border-slate-200 rounded-md focus:ring-1 focus:ring-cyan-500 outline-none p-0 mx-0.5"
                min={min}
                aria-label="Cantidad"
            />
            <button
                onClick={() => onChange(quantity + 1)}
                className="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-md text-slate-600 border border-slate-200"
                aria-label="Aumentar cantidad"
            >
                <Plus size={12} />
            </button>
        </div>
    );
}

function QuantityControlCompact({ quantity, onChange, min = 1 }: QuantityControlProps) {
    return (
        <div className="flex items-center bg-slate-100 rounded-lg border border-slate-200">
            <button
                onClick={() => onChange(quantity - 1)}
                className="p-1 hover:bg-slate-200 rounded-l-lg text-slate-600 disabled:opacity-50"
                disabled={quantity <= min}
                aria-label="Disminuir cantidad"
            >
                <Minus size={14} />
            </button>
            <input
                type="number"
                value={quantity}
                onChange={(e) => onChange(parseInt(e.target.value) || min)}
                className="w-10 text-center bg-transparent font-mono font-bold text-slate-800 outline-none text-sm appearance-none m-0"
                min={min}
                aria-label="Cantidad"
            />
            <button
                onClick={() => onChange(quantity + 1)}
                className="p-1 hover:bg-slate-200 rounded-r-lg text-slate-600"
                aria-label="Aumentar cantidad"
            >
                <Plus size={14} />
            </button>
        </div>
    );
}

// Empty State
function CartEmptyState({ className = '' }: { className?: string }) {
    return (
        <div className={`h-full flex flex-col items-center justify-center text-slate-300 ${className}`}>
            <svg
                className="w-20 h-20 mb-6 opacity-20"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                />
            </svg>
            <h3 className="text-2xl font-bold text-slate-400">El carrito está vacío</h3>
            <p className="text-slate-400">Escanee un producto o use el buscador</p>
        </div>
    );
}

export default Cart;
