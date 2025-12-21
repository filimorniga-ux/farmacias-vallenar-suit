'use client';

import { useState } from 'react';
import { LEGAL_DOCS, LegalDocument } from '@/config/legal_docs';
import { LegalDocCard } from '@/presentation/components/legal/LegalDocCard';
import { LegalDocViewer } from '@/presentation/components/legal/LegalDocViewer';
import { ArrowLeft, Book } from 'lucide-react';
import Link from 'next/link';

export default function LegalPage() {
    const [selectedDoc, setSelectedDoc] = useState<LegalDocument | null>(null);

    return (
        <main className="min-h-screen bg-zinc-50 dark:bg-black">
            {/* Header */}
            <header className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-30">
                <div className="container mx-auto px-4 max-w-7xl h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="p-2 -ml-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-colors"
                        >
                            <ArrowLeft size={20} />
                        </Link>
                        <div className="flex items-center gap-2.5">
                            <span className="p-2 rounded-lg bg-blue-600 text-white shadow-lg shadow-blue-600/20">
                                <Book size={20} />
                            </span>
                            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400">
                                Normativa Legal
                            </h1>
                        </div>
                    </div>
                </div>
            </header>

            {/* Content */}
            <div className="container mx-auto px-4 max-w-7xl py-8">
                <div className="mb-8">
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
                        Biblioteca Regulatoria
                    </h2>
                    <p className="text-zinc-600 dark:text-zinc-400 max-w-3xl">
                        Repositorio digital de toda la normativa legal, decretos y reglamentos vigentes requeridos por la autoridad sanitaria (ISP/SEREMI).
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {LEGAL_DOCS.map((doc) => (
                        <LegalDocCard
                            key={doc.id}
                            doc={doc}
                            onClick={setSelectedDoc}
                        />
                    ))}
                </div>
            </div>

            {/* Viewer Modal */}
            <LegalDocViewer
                doc={selectedDoc}
                onClose={() => setSelectedDoc(null)}
            />
        </main>
    );
}
