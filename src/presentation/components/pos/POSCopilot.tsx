
import { useEffect, useState } from 'react';
import { usePharmaStore } from '@/presentation/store/useStore';
import { POSAssistantService, POSSuggestion } from '@/services/pos-assistant';
import { Lightbulb, AlertTriangle, Info, Sparkles, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { CartItem } from '@/domain/types'; // Correct import path if needed

interface POSCopilotProps {
    overrideCart?: CartItem[];
}

export default function POSCopilot({ overrideCart }: POSCopilotProps) {
    const { cart: storeCart } = usePharmaStore();
    const cart = overrideCart || storeCart;

    const [suggestions, setSuggestions] = useState<POSSuggestion[]>([]);
    const [isVisible, setIsVisible] = useState(true);

    // Reactively analyze cart
    useEffect(() => {
        if (cart.length === 0) {
            setSuggestions([]);
            return;
        }
        const results = POSAssistantService.analyzeCart(cart);
        setSuggestions(results);
        if (results.length > 0) setIsVisible(true);
    }, [cart]);

    if (suggestions.length === 0) return null;

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="fixed bottom-24 right-6 w-80 bg-white shadow-2xl rounded-xl border border-purple-100 overflow-hidden z-50 pointer-events-auto"
                >
                    {/* Header */}
                    <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-3 flex justify-between items-center">
                        <div className="flex items-center gap-2 text-white">
                            <Sparkles className="h-5 w-5" />
                            <h3 className="font-bold text-sm">Asistente IA</h3>
                        </div>
                        <button
                            onClick={() => setIsVisible(false)}
                            className="text-white/80 hover:text-white"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    {/* Suggestions List */}
                    <div className="max-h-96 overflow-y-auto p-4 space-y-3 bg-purple-50/50">
                        {suggestions.map((s, idx) => (
                            <div
                                key={idx}
                                className={`p-3 rounded-lg border shadow-sm ${s.type === 'WARNING' ? 'bg-red-50 border-red-200' :
                                    s.type === 'OPPORTUNITY' ? 'bg-green-50 border-green-200' :
                                        'bg-blue-50 border-blue-200'
                                    }`}
                            >
                                <div className="flex gap-3">
                                    <div className="shrink-0 mt-0.5">
                                        {s.type === 'WARNING' && <AlertTriangle className="h-5 w-5 text-red-600" />}
                                        {s.type === 'OPPORTUNITY' && <Lightbulb className="h-5 w-5 text-green-600" />}
                                        {s.type === 'INFO' && <Info className="h-5 w-5 text-blue-600" />}
                                    </div>
                                    <div className="flex-1">
                                        <p className={`text-sm font-medium ${s.type === 'WARNING' ? 'text-red-800' :
                                            s.type === 'OPPORTUNITY' ? 'text-green-800' :
                                                'text-blue-800'
                                            }`}>
                                            {s.message}
                                        </p>

                                        {s.savingsAmount && (
                                            <p className="text-xs font-bold text-green-700 mt-1">
                                                Ahorro estimado: ${s.savingsAmount.toLocaleString('es-CL')}
                                            </p>
                                        )}

                                        {s.actionLabel && (
                                            <button
                                                className={`mt-2 text-xs font-bold px-3 py-1.5 rounded-md transition-colors ${s.type === 'OPPORTUNITY' ? 'bg-green-200 text-green-800 hover:bg-green-300' :
                                                    'bg-blue-200 text-blue-800 hover:bg-blue-300'
                                                    }`}
                                                onClick={() => {
                                                    // Logic to fetch related SKU and add/replace
                                                    // This is a mockup action for now
                                                    alert('Acción ejecutada: ' + s.relatedSku);
                                                }}
                                            >
                                                {s.actionLabel}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
