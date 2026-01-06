
import React, { useState, useRef, useEffect } from 'react';
import {
    LayoutGrid,
    RefreshCw,
    TrendingDown,
    Lock,
    FileText,
    Plus,
    Trash2,
    MoreVertical,
    LogOut,
    Menu,
    ChevronDown,
    DollarSign,
    Box
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface POSHeaderActionsProps {
    shiftStatus: 'ACTIVE' | 'CLOSED' | undefined;
    shiftId?: string;

    // Display Info
    operatorName?: string;
    locationName?: string;

    // Actions
    onHandover: () => void;
    onMovement: () => void;
    onAudit: () => void;
    onCloseTurn: () => void;
    onOpenTurn: () => void;

    onHistory: () => void;
    onQuote: () => void;
    isQuoteMode: boolean;
    onManualItem: () => void;
    onClearCart: () => void;
}

export const POSHeaderActions: React.FC<POSHeaderActionsProps> = ({
    shiftStatus,
    shiftId,
    operatorName,
    locationName,
    onHandover,
    onMovement,
    onAudit,
    onCloseTurn,
    onOpenTurn,
    onHistory,
    onQuote,
    isQuoteMode,
    onManualItem,
    onClearCart
}) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const isShiftActive = shiftStatus === 'ACTIVE';

    // Dropdown Menu Item Component
    const MenuItem = ({
        icon: Icon,
        label,
        onClick,
        danger = false,
        disabled = false
    }: {
        icon: any,
        label: string,
        onClick: () => void,
        danger?: boolean,
        disabled?: boolean
    }) => (
        <button
            onClick={(e) => {
                if (disabled) return;
                onClick();
                setIsMenuOpen(false);
                e.stopPropagation();
            }}
            disabled={disabled}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors
                ${danger
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-slate-700 hover:bg-slate-50'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
        >
            <Icon size={18} className={danger ? 'text-red-500' : 'text-slate-400'} />
            {label}
        </button>
    );

    return (
        <div className="flex items-center gap-2">

            {/* --- PRIMARY ACTIONS (VISIBLE) --- */}

            {/* Manual Item */}
            <button
                onClick={onManualItem}
                className="hidden md:flex flex-col items-center justify-center w-12 h-12 rounded-xl text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors"
                title="Agregar Manual"
            >
                <Plus size={20} />
            </button>

            {/* Quote Mode Toggle */}
            <button
                onClick={onQuote}
                className={`hidden md:flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-colors
                    ${isQuoteMode
                        ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-300'
                        : 'text-slate-600 bg-slate-50 hover:bg-slate-100'
                    }`}
                title={isQuoteMode ? "Salir de Cotización" : "Modo Cotización"}
            >
                <FileText size={20} />
            </button>

            {/* Clear Cart */}
            <button
                onClick={onClearCart}
                className="hidden md:flex flex-col items-center justify-center w-12 h-12 rounded-xl text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
                title="Limpiar Carrito"
            >
                <Trash2 size={20} />
            </button>

            <div className="w-px h-8 bg-slate-200 mx-1 hidden md:block"></div>

            {/* --- SHIFT MANAGEMENT DROPDOWN --- */}
            <div className="relative" ref={menuRef}>
                <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm border
                        ${isShiftActive
                            ? 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                            : 'bg-slate-800 border-slate-700 text-white hover:bg-slate-700'
                        }
                    `}
                >
                    {isShiftActive ? (
                        <>
                            <LayoutGrid size={18} className="text-blue-600" />
                            <span className="hidden lg:inline">Gestión Caja</span>
                            <span className="lg:hidden">Menú</span>
                        </>
                    ) : (
                        <>
                            <Lock size={18} />
                            <span>Caja Cerrada</span>
                        </>
                    )}
                    <ChevronDown size={16} className={`transition-transform ${isMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                    {isMenuOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            transition={{ duration: 0.1 }}
                            className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-50 origin-top-right"
                        >
                            {isShiftActive ? (
                                <>
                                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                            {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
                                        </p>
                                        <div className="flex flex-col gap-0.5">
                                            <p className="text-sm font-bold text-slate-800 truncate leading-tight">
                                                {operatorName || 'Sin Operador'}
                                            </p>
                                            <p className="text-xs text-slate-500 truncate">
                                                {locationName || 'Sin Sucursal'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="py-1">
                                        <MenuItem
                                            icon={Box}
                                            label="Historial de Ventas"
                                            onClick={onHistory}
                                        />
                                        <MenuItem
                                            icon={DollarSign}
                                            label="Ingreso / Gasto"
                                            onClick={onMovement}
                                        />
                                        <MenuItem
                                            icon={RefreshCw}
                                            label="Cambio de Turno"
                                            onClick={onHandover}
                                        />
                                        <MenuItem
                                            icon={Lock}
                                            label="Arqueo Parcial"
                                            onClick={onAudit}
                                        />
                                    </div>

                                    <div className="h-px bg-slate-100 my-1"></div>

                                    {/* Mobile Only Actions in Menu */}
                                    <div className="md:hidden py-1">
                                        <MenuItem icon={Plus} label="Producto Manual" onClick={onManualItem} />
                                        <MenuItem icon={FileText} label={isQuoteMode ? "Salir Cotización" : "Modo Cotización"} onClick={onQuote} />
                                        <MenuItem icon={Box} label="Historial" onClick={onHistory} />
                                        <MenuItem icon={Trash2} label="Limpiar Carrito" onClick={onClearCart} danger />
                                        <div className="h-px bg-slate-100 my-1"></div>
                                    </div>

                                    <div className="py-1">
                                        <MenuItem
                                            icon={LogOut}
                                            label="Cerrar Turno"
                                            onClick={onCloseTurn}
                                            danger
                                        />
                                    </div>
                                </>
                            ) : (
                                <div className="py-1">
                                    <MenuItem
                                        icon={Lock}
                                        label="Abrir Turno"
                                        onClick={onOpenTurn}
                                    />
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};
