'use client';

import { useRouter } from 'next/navigation';
import ContextSelectionPage from '@/presentation/pages/ContextSelectionPage';
import { LandingPageContent } from '@/presentation/pages/LandingPage';

type PublicEntryClientPageProps = {
    forceContextSelection: boolean;
};

export default function PublicEntryClientPage({
    forceContextSelection,
}: PublicEntryClientPageProps) {
    const router = useRouter();

    const navigateTo = (path: string, options?: { replace?: boolean }) => {
        if (options?.replace) {
            router.replace(path);
            return;
        }

        router.push(path);
    };

    if (forceContextSelection) {
        return <ContextSelectionPage />;
    }

    return <LandingPageContent navigateTo={navigateTo} />;
}
