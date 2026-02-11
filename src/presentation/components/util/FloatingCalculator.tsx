import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Minus, History, Trash2, GripHorizontal } from 'lucide-react';
import { useCalculatorStore } from '../../hooks/useCalculator';

/**
 * Calculadora flotante arrastrable con historial.
 * Disponible para cualquier usuario logueado.
 */
const FloatingCalculator: React.FC = () => {
    const {
        isOpen, isMinimized,
        display, expression,
        close, toggleMinimize,
        inputDigit, inputDecimal, setOperator,
        calculate, clear, percentage, squareRoot, toggleSign, backspace,
        history, clearHistory,
    } = useCalculatorStore();

    const [showHistory, setShowHistory] = useState(false);
    const [position, setPosition] = useState({ x: -1, y: -1 });
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const calcRef = useRef<HTMLDivElement>(null);

    // Initialize position on first open (center-right)
    useEffect(() => {
        if (isOpen && position.x === -1) {
            setPosition({
                x: Math.max(16, window.innerWidth - 340),
                y: Math.max(80, Math.floor(window.innerHeight * 0.15)),
            });
        }
    }, [isOpen, position.x]);

    // Drag handlers
    const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        setIsDragging(true);
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        dragOffset.current = {
            x: clientX - position.x,
            y: clientY - position.y,
        };
    }, [position]);

    useEffect(() => {
        if (!isDragging) return;

        const handleMove = (e: MouseEvent | TouchEvent) => {
            const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
            const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
            const newX = Math.max(0, Math.min(window.innerWidth - 320, clientX - dragOffset.current.x));
            const newY = Math.max(0, Math.min(window.innerHeight - 100, clientY - dragOffset.current.y));
            setPosition({ x: newX, y: newY });
        };

        const handleEnd = () => setIsDragging(false);

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleEnd);
        window.addEventListener('touchmove', handleMove, { passive: false });
        window.addEventListener('touchend', handleEnd);

        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleEnd);
            window.removeEventListener('touchmove', handleMove);
            window.removeEventListener('touchend', handleEnd);
        };
    }, [isDragging]);

    // Keyboard support
    useEffect(() => {
        if (!isOpen || isMinimized) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key >= '0' && e.key <= '9') inputDigit(e.key);
            else if (e.key === '.') inputDecimal();
            else if (e.key === '+') setOperator('+');
            else if (e.key === '-') setOperator('-');
            else if (e.key === '*') setOperator('×');
            else if (e.key === '/') { e.preventDefault(); setOperator('÷'); }
            else if (e.key === 'Enter' || e.key === '=') calculate();
            else if (e.key === 'Escape') close();
            else if (e.key === 'Backspace') backspace();
            else if (e.key === '%') percentage();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isOpen, isMinimized, inputDigit, inputDecimal, setOperator, calculate, close, backspace, percentage]);

    if (!isOpen) return null;

    const btnBase = "flex items-center justify-center rounded-xl font-semibold transition-all duration-150 active:scale-95 select-none";
    const btnNum = `${btnBase} bg-white hover:bg-slate-50 text-slate-800 text-lg border border-slate-100 shadow-sm`;
    const btnOp = `${btnBase} bg-sky-50 hover:bg-sky-100 text-sky-700 text-lg border border-sky-100`;
    const btnAction = `${btnBase} bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm border border-slate-200`;
    const btnEquals = `${btnBase} bg-sky-500 hover:bg-sky-600 text-white text-xl shadow-md shadow-sky-200`;

    return (
        <div
            ref={calcRef}
            className="fixed z-[100] select-none"
            style={{
                left: position.x,
                top: position.y,
                touchAction: 'none',
            }}
        >
            <div className={`w-[300px] bg-white/95 backdrop-blur-xl rounded-2xl border border-slate-200 
                       shadow-2xl shadow-slate-300/40 overflow-hidden transition-all duration-200
                       ${isDragging ? 'shadow-2xl scale-[1.02] cursor-grabbing' : ''}`}>

                {/* Title Bar — draggable */}
                <div
                    onMouseDown={handleDragStart}
                    onTouchStart={handleDragStart}
                    className="flex items-center justify-between px-3 py-2.5 bg-gradient-to-r from-sky-500 to-sky-600 
                     text-white cursor-grab active:cursor-grabbing"
                >
                    <div className="flex items-center gap-2">
                        <GripHorizontal size={14} className="opacity-60" />
                        <span className="text-xs font-bold tracking-wide uppercase">Calculadora</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setShowHistory(!showHistory)}
                            className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                            title="Historial"
                        >
                            <History size={14} />
                        </button>
                        <button
                            onClick={toggleMinimize}
                            className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                            title={isMinimized ? "Restaurar" : "Minimizar"}
                        >
                            <Minus size={14} />
                        </button>
                        <button
                            onClick={close}
                            className="p-1 hover:bg-red-400/40 rounded-lg transition-colors"
                            title="Cerrar"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>

                {/* Body — hidden when minimized */}
                {!isMinimized && (
                    <>
                        {/* Display */}
                        <div className="px-4 pt-3 pb-2 bg-slate-50/80">
                            {expression && (
                                <div className="text-xs text-slate-400 text-right h-4 truncate font-mono">
                                    {expression}
                                </div>
                            )}
                            <div className="text-right text-3xl font-bold text-slate-800 tabular-nums tracking-tight truncate font-mono min-h-[44px] flex items-end justify-end">
                                {display}
                            </div>
                        </div>

                        {/* History Panel (toggle) */}
                        {showHistory && (
                            <div className="px-3 pb-2 bg-slate-50/80 border-t border-slate-100">
                                <div className="flex items-center justify-between py-1.5">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                        Historial ({history.length})
                                    </span>
                                    {history.length > 0 && (
                                        <button onClick={clearHistory} className="p-1 hover:bg-red-50 rounded text-red-400 hover:text-red-500">
                                            <Trash2 size={12} />
                                        </button>
                                    )}
                                </div>
                                <div className="max-h-32 overflow-y-auto space-y-1 scrollbar-thin">
                                    {history.length === 0 ? (
                                        <p className="text-[11px] text-slate-300 text-center py-2">Sin operaciones</p>
                                    ) : (
                                        history.map((entry, i) => (
                                            <div key={entry.timestamp + i} className="flex justify-between items-center text-[11px] py-0.5 px-1 rounded hover:bg-slate-100">
                                                <span className="text-slate-400 truncate flex-1 mr-2 font-mono">{entry.expression}</span>
                                                <span className="text-slate-700 font-bold font-mono">= {entry.result}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Buttons Grid */}
                        <div className="p-3 grid grid-cols-4 gap-1.5">
                            {/* Row 1: C, ±, √, ÷ */}
                            <button onClick={clear} className={btnAction}>C</button>
                            <button onClick={toggleSign} className={btnAction}>±</button>
                            <button onClick={squareRoot} className={btnAction}>√</button>
                            <button onClick={() => setOperator('÷')} className={btnOp}>÷</button>

                            {/* Row 2: 7, 8, 9, × */}
                            <button onClick={() => inputDigit('7')} className={btnNum}>7</button>
                            <button onClick={() => inputDigit('8')} className={btnNum}>8</button>
                            <button onClick={() => inputDigit('9')} className={btnNum}>9</button>
                            <button onClick={() => setOperator('×')} className={btnOp}>×</button>

                            {/* Row 3: 4, 5, 6, - */}
                            <button onClick={() => inputDigit('4')} className={btnNum}>4</button>
                            <button onClick={() => inputDigit('5')} className={btnNum}>5</button>
                            <button onClick={() => inputDigit('6')} className={btnNum}>6</button>
                            <button onClick={() => setOperator('-')} className={btnOp}>−</button>

                            {/* Row 4: 1, 2, 3, + */}
                            <button onClick={() => inputDigit('1')} className={btnNum}>1</button>
                            <button onClick={() => inputDigit('2')} className={btnNum}>2</button>
                            <button onClick={() => inputDigit('3')} className={btnNum}>3</button>
                            <button onClick={() => setOperator('+')} className={btnOp}>+</button>

                            {/* Row 5: %, 0, ., = */}
                            <button onClick={percentage} className={btnAction}>%</button>
                            <button onClick={() => inputDigit('0')} className={btnNum}>0</button>
                            <button onClick={inputDecimal} className={btnNum}>.</button>
                            <button onClick={calculate} className={btnEquals}>=</button>
                        </div>

                        {/* Backspace */}
                        <div className="px-3 pb-3">
                            <button onClick={backspace} className="w-full py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-xs text-slate-400 font-medium border border-slate-100 transition-colors active:scale-[0.98]">
                                ← Borrar
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default FloatingCalculator;
