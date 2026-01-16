'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Send, X, Bot, User, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { askReportsAssistant } from '@/actions/analytics/ai-reports-assistant';
import { usePharmaStore } from '../../store/useStore';

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    toolData?: any;
    timestamp: Date;
}

export default function ReportsAssistant() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'welcome',
            role: 'assistant',
            content: 'Hola! Soy tu asistente de Inteligencia de Negocios. 📊\n\nPuedes preguntarme sobre:\n- Ventas de productos\n- Stock e inventario\n- Facturas recibidas\n- Personal activo',
            timestamp: new Date()
        }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { currentLocationId, locations } = usePharmaStore();

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) scrollToBottom();
    }, [messages, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            // Prepare context for backend
            const locationName = locations.find(l => l.id === currentLocationId)?.name;
            const context = { locationId: currentLocationId || undefined, locationName: locationName || undefined };

            // Invoke Server Action
            // We pass only the content/role history to be efficient
            const apiMessages = messages.concat(userMsg).map(m => ({ role: m.role as any, content: m.content })).slice(-10); // keep context small

            const response = await askReportsAssistant(apiMessages, context);

            if (response.error) {
                const errorMsg: Message = {
                    id: Date.now() + 'err',
                    role: 'assistant',
                    content: 'Lo siento, hubo un error al procesar tu consulta: ' + response.error,
                    timestamp: new Date()
                };
                setMessages(prev => [...prev, errorMsg]);
            } else {
                const aiMsg: Message = {
                    id: Date.now() + 'ai',
                    role: 'assistant',
                    content: response.message?.content || 'No pude generar una respuesta textual.',
                    timestamp: new Date()
                };
                setMessages(prev => [...prev, aiMsg]);
            }

        } catch (error) {
            console.error(error);
            const errorMsg: Message = {
                id: Date.now() + 'err',
                role: 'assistant',
                content: 'Error de conexión. Por favor intenta nuevamente.',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
        }
    };

    // Helper to format text with simple markdown-like bold
    const formatText = (text: string) => {
        return text.split('\n').map((line, i) => (
            <p key={i} className="mb-1 last:mb-0 min-h-[1.2em]">
                {line.split(/(\*\*.*?\*\*)/).map((part, j) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                        return <strong key={j}>{part.slice(2, -2)}</strong>;
                    }
                    return part;
                })}
            </p>
        ));
    };

    return (
        <>
            {/* Toggle Button (Floating Action Button) */}
            <motion.button
                onClick={() => setIsOpen(!isOpen)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`fixed bottom-6 right-6 z-50 p-4 rounded-full shadow-2xl transition-colors flex items-center justify-center ${isOpen ? 'bg-slate-800 text-white' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white'
                    }`}
            >
                {isOpen ? <X size={24} /> : <Sparkles size={24} />}
            </motion.button>

            {/* Chat Window */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.9 }}
                        transition={{ duration: 0.2 }}
                        className="fixed bottom-20 right-6 w-[400px] h-[600px] max-h-[80vh] bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 flex flex-col overflow-hidden"
                    >
                        {/* Header */}
                        <div className="bg-slate-50 border-b border-slate-200 p-4 flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                                <Bot size={24} />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800">Suit Enterprise AI</h3>
                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                    Online - GPT-4 Optimized
                                </p>
                            </div>
                        </div>

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                            {messages.map((msg) => (
                                <motion.div
                                    key={msg.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div className={`max-w-[85%] rounded-2xl p-3 text-sm ${msg.role === 'user'
                                        ? 'bg-blue-600 text-white rounded-tr-none'
                                        : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none shadow-sm'
                                        }`}>
                                        {msg.role === 'assistant' && (
                                            <div className="flex items-center gap-2 mb-1 text-xs font-bold opacity-50">
                                                <Bot size={12} /> Asistente
                                            </div>
                                        )}
                                        <div className="whitespace-pre-wrap leading-relaxed">
                                            {formatText(msg.content)}
                                        </div>
                                        <div className={`text-[10px] mt-1 text-right ${msg.role === 'user' ? 'text-blue-200' : 'text-slate-400'}`}>
                                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                            {isLoading && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                                    <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none p-4 shadow-sm flex items-center gap-2">
                                        <Loader2 className="animate-spin text-indigo-500" size={16} />
                                        <span className="text-xs text-slate-500 italic">Analizando datos...</span>
                                    </div>
                                </motion.div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <form onSubmit={handleSubmit} className="p-4 bg-white border-t border-slate-200">
                            <div className="relative flex items-center gap-2">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Pregunta sobre ventas, stock..."
                                    className="flex-1 bg-slate-100 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-400"
                                    disabled={isLoading}
                                    autoFocus
                                />
                                <button
                                    type="submit"
                                    disabled={!input.trim() || isLoading}
                                    className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <Send size={18} />
                                </button>
                            </div>
                            <p className="text-[10px] text-center text-slate-400 mt-2">
                                La IA puede cometer errores. Verifica la información importante.
                            </p>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
