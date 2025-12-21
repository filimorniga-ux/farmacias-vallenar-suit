import { X } from "lucide-react";
import { LegalDocument } from "@/config/legal_docs";
import { useEffect } from "react";

interface LegalDocViewerProps {
    doc: LegalDocument | null;
    onClose: () => void;
}

export function LegalDocViewer({ doc, onClose }: LegalDocViewerProps) {
    // Lock scroll when open
    useEffect(() => {
        if (doc) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [doc]);

    if (!doc) return null;

    const fileUrl = `/legal/${doc.filename}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-6xl h-[90vh] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                    <div>
                        <h2 className="text-lg font-bold text-zinc-900 dark:text-white truncate max-w-2xl">
                            {doc.title}
                        </h2>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                            {doc.filename}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 bg-zinc-100 dark:bg-zinc-950/50 p-1">
                    <iframe
                        src={fileUrl}
                        className="w-full h-full rounded-md border-0"
                        title={doc.title}
                    />
                </div>
            </div>

            {/* Click outside to close area */}
            <div className="absolute inset-0 -z-10" onClick={onClose} />
        </div>
    );
}
