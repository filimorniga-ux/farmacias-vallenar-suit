
'use client';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, localStoragePersister } from '@/lib/react-queryclient';
import SessionGuard from '@/presentation/components/security/SessionGuard';
import { Toaster } from 'sonner';

export default function Providers({ children }: { children: React.ReactNode }) {
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
