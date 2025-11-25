'use client';

import { useAuthStore } from '@/lib/store/auth';
import { Plus } from 'lucide-react';

export default function AddPurchaseButton() {
    const { user } = useAuthStore();

    // Only ADMIN and QUIMICO can add purchases. VENDEDOR is read-only.
    if (!user || user.role === 'VENDEDOR') {
        return null;
    }

    return (
        <button
            type="button"
            className="inline-flex items-center rounded-md bg-purple-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-purple-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600"
        >
            <Plus className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
            Ingresar Compra
        </button>
    );
}
