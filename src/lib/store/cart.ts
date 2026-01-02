import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Product {
    id: string | number;  // Support both numeric and UUID IDs
    name: string;
    price: number;
    stock: number;
    requiresPrescription: boolean;
    batchId?: string;     // UUID del lote de inventario (para ventas reales)
}

export interface CartItem extends Product {
    quantity: number;
}

interface CartState {
    cart: CartItem[];
    addToCart: (product: Product) => void;
    removeFromCart: (productId: string | number) => void;
    updateQuantity: (productId: string | number, delta: number) => void;
    clearCart: () => void;
    getCartTotal: () => number;
}

export const useCartStore = create<CartState>()(
    persist(
        (set, get) => ({
            cart: [],
            addToCart: (product) =>
                set((state) => {
                    // Si tiene batchId, usamos ese como identificador único
                    // Esto permite agregar el mismo producto de diferentes lotes
                    const identifier = product.batchId || product.id;
                    const existing = state.cart.find((item) => 
                        (item.batchId && item.batchId === product.batchId) || 
                        (!item.batchId && item.id === product.id)
                    );
                    
                    if (existing) {
                        return {
                            cart: state.cart.map((item) => {
                                const itemMatch = (item.batchId && item.batchId === product.batchId) || 
                                                  (!item.batchId && item.id === product.id);
                                return itemMatch
                                    ? { ...item, quantity: item.quantity + 1 }
                                    : item;
                            }),
                        };
                    }
                    return { cart: [...state.cart, { ...product, quantity: 1 }] };
                }),
            removeFromCart: (productId) =>
                set((state) => ({
                    cart: state.cart.filter((item) => {
                        // Support removal by batchId or id
                        if (typeof productId === 'string' && item.batchId === productId) {
                            return false;
                        }
                        return item.id !== productId;
                    }),
                })),
            updateQuantity: (productId, delta) =>
                set((state) => ({
                    cart: state.cart.map((item) => {
                        const match = (typeof productId === 'string' && item.batchId === productId) ||
                                      item.id === productId;
                        if (match) {
                            const newQty = item.quantity + delta;
                            return newQty > 0 ? { ...item, quantity: newQty } : item;
                        }
                        return item;
                    }),
                })),
            clearCart: () => set({ cart: [] }),
            getCartTotal: () => {
                return get().cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
            },
        }),
        {
            name: 'farmacias-vallenar-cart',
        }
    )
);
