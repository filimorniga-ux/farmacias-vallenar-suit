
'use client';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, localStoragePersister } from '@/lib/react-queryclient';
import SessionGuard from '@/presentation/components/security/SessionGuard';
import { Toaster } from 'sonner';
import { useGlobalFullscreen } from '@/presentation/hooks/useGlobalFullscreen';

export default function Providers({ children }: { children: React.ReactNode }) {
    // Global fullscreen on first user interaction (web/PWA only)
    useGlobalFullscreen();

    return (
        <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{
                persister: localStoragePersister!,
                maxAge: 1000 * 60 * 60 * 24, // 24 horas
            }}
        >
            <SessionGuard>
                {children}
                <Toaster richColors position="bottom-right" closeButton />
            </SessionGuard>
        </PersistQueryClientProvider>
    );
}
