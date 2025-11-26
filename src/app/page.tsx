'use client';

import dynamic from 'next/dynamic';

// Import App dynamically to avoid SSR issues with HashRouter/Browser APIs if any
const App = dynamic(() => import('../App'), { ssr: false });

export default function Page() {
    return (
        <div className="min-h-screen bg-slate-50 text-slate-900">
            <App />
        </div>
    );
}
