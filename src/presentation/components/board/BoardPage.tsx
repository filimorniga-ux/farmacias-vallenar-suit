'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Trash2, Clock, MapPin, User, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { postNote, deleteNote, getNotes } from '@/actions/board-v2';
import { format, isToday, isYesterday } from 'date-fns';
import { es } from 'date-fns/locale';
import { usePharmaStore } from '../../store/useStore';
import { PinModal } from '@/components/shared/PinModal';
import { verifyUserPin } from '@/actions/auth-v2';

interface Note {
    id: string;
    content: string;
    author_name: string;
    author_role: string;
    branch: string;
    created_at: string | Date;
    created_by: string;
}

export default function BoardPage() {
    const { user } = usePharmaStore();
    const [notes, setNotes] = useState<Note[]>([]);
    const [content, setContent] = useState('');
    const [isPending, startTransition] = useTransition();
    const [isLoading, setIsLoading] = useState(true);

    const canDelete = user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'GERENTE_GENERAL';

    const loadNotes = async () => {
        setIsLoading(true);
        const res = await getNotes();
        if (res.success && res.data) {
            setNotes(res.data as Note[]);
        } else {
            toast.error('Error al cargar la pizarra');
        }
        setIsLoading(false);
    };

    useEffect(() => {
        loadNotes();
        // Optional: Simple polling every minute to keep it semi-live without websockets for now (KISS)
        const interval = setInterval(loadNotes, 60000);
        return () => clearInterval(interval);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!content.trim() || !user) return;

        startTransition(async () => {
            const res = await postNote({
                content,
                userId: user.id,
                authorName: user.name,
                authorRole: user.role,
                branch: 'General' // Simplified for now, can perform lookup if needed
            });

            if (res.success) {
                setContent('');
                toast.success('Nota publicada');
                loadNotes();
            } else {
                toast.error(res.error || 'Error al publicar');
            }
        });
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Borrar esta nota?')) return;
        if (!user) return;

        const res = await deleteNote(id, user.id);
        if (res.success) {
            toast.success('Nota eliminada');
            loadNotes();
        } else {
            toast.error(res.error || 'Error al eliminar');
        }
    };

    // PIN Modal State
    const [pinModal, setPinModal] = useState<{ isOpen: boolean; noteId: string | null }>({ isOpen: false, noteId: null });
    // Actually, I'll add the import at the top in a separate chunk to be clean.

    // ... loadNotes ...

    const handleDeleteClick = (id: string) => {
        // Only managers/admins can delete
        if (!user) return;
        setPinModal({ isOpen: true, noteId: id });
    };

    const handlePinSubmit = async (pin: string): Promise<boolean> => {
        if (!user || !pinModal.noteId) return false;

        const res = await verifyUserPin(user.id, pin);
        if (res.success) {
            // Proceed to delete
            const deleteRes = await deleteNote(pinModal.noteId, user.id);
            if (deleteRes.success) {
                toast.success('Nota eliminada');
                loadNotes();
                return true; // Modal closes automatically on success=true
            } else {
                toast.error(deleteRes.error || 'Error al eliminar');
                return false;
            }
        } else {
            // PIN failed
            return false;
        }
    };

    // Grouping Logic
    const groupedNotes = notes.reduce((acc, note) => {
        const date = new Date(note.created_at);
        let key = format(date, "EEEE d 'de' MMMM", { locale: es });

        if (isToday(date)) key = 'Hoy';
        if (isYesterday(date)) key = 'Ayer';

        if (!acc[key]) acc[key] = [];
        acc[key].push(note);
        return acc;
    }, {} as Record<string, Note[]>);

    return (
        <div className="flex flex-col h-full max-w-4xl mx-auto w-full p-4 md:p-6">
            {/* Header / Input Area */}
            <div className="mb-8 p-4 bg-white rounded-2xl shadow-sm border border-slate-100">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-4 flex items-center gap-2">
                    <MessageSquare className="text-blue-600" />
                    Pizarra de Novedades
                </h1>

                <form onSubmit={handleSubmit} className="relative">
                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Escribe una novedad para el equipo... (Ej: Llegó pedido de laboratorio X, Falta paracetamol en caja 2, etc.)"
                        className="w-full p-4 pr-14 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none transition-all h-24"
                        disabled={isPending || !user}
                    />
                    <button
                        type="submit"
                        disabled={isPending || !content.trim() || !user}
                        className="absolute bottom-3 right-3 p-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
                    >
                        {isPending ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : <Send size={18} />}
                    </button>
                </form>
            </div>

            {/* Feed Area */}
            <div className="flex-1 overflow-y-auto pr-2 space-y-6 pb-20 scrollbar-hide">
                {isLoading && notes.length === 0 ? (
                    <div className="text-center py-10 text-slate-400">Cargando notas...</div>
                ) : Object.keys(groupedNotes).length === 0 ? (
                    <div className="text-center py-10 text-slate-400">
                        <p className="text-lg">No hay novedades recientes.</p>
                        <p className="text-sm">Sé el primero en publicar algo.</p>
                    </div>
                ) : (
                    Object.entries(groupedNotes).map(([dateLabel, groupNotes]) => (
                        <div key={dateLabel} className="space-y-4">
                            <div className="sticky top-0 z-10 flex justify-center">
                                <span className="bg-slate-200/80 backdrop-blur-sm text-slate-600 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
                                    {dateLabel}
                                </span>
                            </div>

                            <div className="space-y-3">
                                {groupNotes.map((note) => (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        key={note.id}
                                        className={`bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow relative group ${note.created_by === user?.id ? 'border-l-4 border-l-blue-500' : ''
                                            }`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${note.author_role === 'ADMIN' ? 'bg-purple-100 text-purple-600' :
                                                    note.author_role === 'VENDEDOR' ? 'bg-green-100 text-green-600' :
                                                        'bg-blue-100 text-blue-600'
                                                    }`}>
                                                    {note.author_name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-800">{note.author_name}</p>
                                                    <div className="flex items-center gap-2 text-xs text-slate-500">
                                                        <span className="flex items-center gap-1"><User size={10} /> {note.author_role}</span>
                                                        <span>•</span>
                                                        <span className="flex items-center gap-1"><MapPin size={10} /> {note.branch || 'General'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-slate-400 flex items-center gap-1">
                                                    <Clock size={12} />
                                                    {format(new Date(note.created_at), 'HH:mm')}
                                                </span>
                                                {canDelete && (
                                                    <button
                                                        onClick={() => handleDeleteClick(note.id)}
                                                        className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <p className="text-slate-700 whitespace-pre-wrap pl-10 text-sm leading-relaxed">
                                            {note.content}
                                        </p>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>

            <PinModal
                isOpen={pinModal.isOpen}
                onClose={() => setPinModal({ ...pinModal, isOpen: false })}
                onSubmit={handlePinSubmit}
                title="Eliminar Nota"
                description="Ingrese su PIN de gerente para confirmar eliminación"
                requiredRole="MANAGER"
            />
        </div>
    );
}
