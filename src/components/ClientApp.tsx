'use client';

import dynamic from 'next/dynamic';
import React from 'react';

// Dynamic import with SSR disabled matches the pattern needed for HashRouter/Browser-specific logic
const App = dynamic(() => import('../App'), { ssr: false });

interface ClientAppProps {
    forceContextSelection: boolean;
}

export default function ClientApp({ forceContextSelection }: ClientAppProps) {
    return <App forceContextSelection={forceContextSelection} />;
}
