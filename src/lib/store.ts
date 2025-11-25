import { create } from 'zustand';

export interface CartItem {
    id: number;
    name: string;
    quantity: number;
    unit_price: number;
    total: number;
}

interface POSStore {
    cart: CartItem[];
    addToCart: (item: Omit<CartItem, 'total'>) => void;
    removeFromCart: (id: number) => void;
    clearCart: () => void;
    updateQuantity: (id: number, quantity: number) => void;
    getCartTotal: () => number;
}

export const usePOSStore = create<POSStore>((set, get) => ({
    cart: [],

    addToCart: (item) => {
        const existingItem = get().cart.find((i) => i.id === item.id);

        if (existingItem) {
            set({
                cart: get().cart.map((i) =>
                    i.id === item.id
                        ? { ...i, quantity: i.quantity + item.quantity, total: (i.quantity + item.quantity) * i.unit_price }
                        : i
                ),
            });
        } else {
            set({
                cart: [...get().cart, { ...item, total: item.quantity * item.unit_price }],
            });
        }
    },

    removeFromCart: (id) => {
        set({ cart: get().cart.filter((i) => i.id !== id) });
    },

    clearCart: () => {
        set({ cart: [] });
    },

    updateQuantity: (id, quantity) => {
        if (quantity <= 0) {
            get().removeFromCart(id);
            return;
        }

        set({
            cart: get().cart.map((i) =>
                i.id === id ? { ...i, quantity, total: quantity * i.unit_price } : i
            ),
        });
    },

    getCartTotal: () => {
        return get().cart.reduce((sum, item) => sum + item.total, 0);
    },
}));
