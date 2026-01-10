'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePharmaStore } from '@/presentation/store/useStore';
import { Role } from '@/domain/types';

interface RouteGuardProps {
    children: React.ReactNode;
    allowedRoles?: Role[];
}

export default function RouteGuard({ children, allowedRoles }: RouteGuardProps) {
    const router = useRouter();
    const { user } = usePharmaStore();
    const [authorized, setAuthorized] = useState(false);
    // True hydration check from Zustand utils + React mount
    const [isStoreHydrated, setIsStoreHydrated] = useState(false);

    useEffect(() => {
        // Double check: React mounted AND Zustand finished rehydrating
        const checkHydration = () => {
            if (usePharmaStore.persist.hasHydrated()) {
                setIsStoreHydrated(true);
            } else {
                usePharmaStore.persist.onFinishHydration(() => setIsStoreHydrated(true));
            }
        };
        checkHydration();
    }, []);

    useEffect(() => {
        // STRICT BLOCK: Do absolutely nothing until we are sure hydration happened
        if (!isStoreHydrated) return;

        if (!user) {
            router.push('/login');
            return;
        }

        const userRole = user.role;
        // ... rest of logic
        if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
            setAuthorized(false);
            return;
        }

        setAuthorized(true);
    }, [user, router, allowedRoles, isStoreHydrated]);

    // Show Debug Information if unauthorized (but authenticated)
    if (isStoreHydrated && user && !authorized && allowedRoles && !allowedRoles.includes(user.role)) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
                <div className="bg-white p-8 rounded-xl shadow-lg border border-red-200 max-w-lg w-full">
                    <h1 className="text-2xl font-bold text-red-600 mb-4">Acceso Denegado (Debug)</h1>
                    <div className="space-y-4 font-mono text-sm">
                        <div className="p-3 bg-gray-100 rounded">
                            <p className="font-bold text-gray-700">Tu Rol Actual (del Store Principal):</p>
                            <p className="text-blue-600 text-lg">"{user.role}"</p>
                        </div>
                        <div className="p-3 bg-gray-100 rounded">
                            <p className="font-bold text-gray-700">Roles Permitidos:</p>
                            <p className="text-green-600">
                                {JSON.stringify(allowedRoles)}
                            </p>
                        </div>
                        <div className="p-3 bg-yellow-50 text-yellow-800 rounded text-xs">
                            <p>Si ves esto, el RouteGuard ya está leyendo el usuario correcto. Si el rol coincide, hay un bug en la comparación.</p>
                        </div>
                    </div>
                    <button
                        onClick={() => router.push('/')}
                        className="mt-6 w-full py-2 bg-gray-900 text-white rounded hover:bg-gray-800"
                    >
                        Volver al Inicio
                    </button>
                    <button
                        onClick={() => {
                            // Force logout for debugging
                            usePharmaStore.getState().logout();
                            router.push('/login');
                        }}
                        className="mt-2 w-full py-2 text-red-600 text-sm hover:underline"
                    >
                        Forzar Logout (Debug)
                    </button>
                </div>
            </div>
        );
    }

    if (!authorized) {
        return null; // Loading state
    }

    return <>{children}</>;
}
