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

        const message = String(error?.message || '');
        const digest = String(error?.digest || '');
        const isChunkMismatch =
            /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(message) ||
            /ChunkLoadError|Loading chunk/i.test(digest);

        // One-shot auto recovery for stale cache/chunk mismatch after deploy.
        if (isChunkMismatch && typeof window !== 'undefined') {
            const key = 'fv_chunk_recovery_done';
            const alreadyRetried = sessionStorage.getItem(key) === '1';
            if (!alreadyRetried) {
                sessionStorage.setItem(key, '1');
                window.location.reload();
            }
        }
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
