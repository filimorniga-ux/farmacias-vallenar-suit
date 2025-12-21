import { FileText, ArrowRight } from "lucide-react";
import { LegalDocument } from "@/config/legal_docs";

interface LegalDocCardProps {
    doc: LegalDocument;
    onClick: (doc: LegalDocument) => void;
}

export function LegalDocCard({ doc, onClick }: LegalDocCardProps) {
    return (
        <div
            onClick={() => onClick(doc)}
            className="group relative flex flex-col items-start justify-between p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/5 transition-all cursor-pointer h-full"
        >
            <div className="flex items-start gap-4 w-full">
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <FileText size={24} />
                </div>
                <div className="flex-1 min-w-0">
                    <span className="inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 ring-1 ring-inset ring-zinc-500/10 mb-2">
                        {doc.category || 'DOCUMENTO'}
                    </span>
                    <h3 className="font-semibold text-zinc-900 dark:text-white line-clamp-2 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {doc.title}
                    </h3>
                </div>
            </div>

            <div className="mt-4 flex items-center text-sm font-medium text-zinc-500 dark:text-zinc-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                Ver documento
                <ArrowRight size={16} className="ml-1 transition-transform group-hover:translate-x-1" />
            </div>
        </div>
    );
}
