'use client';

import { useEffect } from 'react';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log error to console (or audit service)
        console.error('Global Error:', error);
    }, [error]);

    return (
        <html>
            <body>
                <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 p-4 text-white">
                    <div className="text-center">
                        <h2 className="mb-4 text-3xl font-bold text-red-500">¡Ups! Algo salió mal</h2>
                        <p className="mb-8 text-slate-300">
                            Ha ocurrido un error crítico en la aplicación via Farmacias Vallenar Suit.
                        </p>
                        <button
                            className="rounded-xl bg-cyan-600 px-6 py-3 font-bold text-white transition-colors hover:bg-cyan-700 shadow-lg shadow-cyan-900/40"
                            onClick={() => reset()}
                        >
                            Intentar de nuevo
                        </button>
                    </div>
                </div>
            </body>
        </html>
    );
}
