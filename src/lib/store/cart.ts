import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Product {
    id: number;
    name: string;
    price: number;
    stock: number;
    requiresPrescription: boolean;
}

export interface CartItem extends Product {
    quantity: number;
}

interface CartState {
    cart: CartItem[];
    addToCart: (product: Product) => void;
    removeFromCart: (productId: number) => void;
    updateQuantity: (productId: number, delta: number) => void;
    clearCart: () => void;
    getCartTotal: () => number;
}

export const useCartStore = create<CartState>()(
    persist(
        (set, get) => ({
            cart: [],
            addToCart: (product) =>
                set((state) => {
                    const existing = state.cart.find((item) => item.id === product.id);
                    if (existing) {
                        return {
                            cart: state.cart.map((item) =>
                                item.id === product.id
                                    ? { ...item, quantity: item.quantity + 1 }
                                    : item
                            ),
                        };
                    }
                    return { cart: [...state.cart, { ...product, quantity: 1 }] };
                }),
            removeFromCart: (productId) =>
                set((state) => ({
                    cart: state.cart.filter((item) => item.id !== productId),
                })),
            updateQuantity: (productId, delta) =>
                set((state) => ({
                    cart: state.cart.map((item) => {
                        if (item.id === productId) {
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
