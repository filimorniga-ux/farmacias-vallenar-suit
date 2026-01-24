
import React from 'react';
import { Delete } from 'lucide-react';

interface VirtualKeyboardProps {
    onKeyPress: (key: string) => void;
    onDelete: () => void;
    onClear: () => void;
    showNumbers?: boolean;
}

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({ onKeyPress, onDelete, onClear, showNumbers = true }) => {
    const numbers = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    const rows = [
        ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ñ'], // Added Ñ
        ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
    ];

    return (
        <div className="bg-slate-100 p-4 rounded-3xl shadow-lg select-none">
            {showNumbers && (
                <div className="flex justify-center gap-2 mb-2">
                    {numbers.map(num => (
                        <button
                            key={num}
                            onClick={() => onKeyPress(num)}
                            className="w-10 h-12 rounded-lg bg-white shadow-sm border-b-2 border-slate-200 active:border-b-0 active:translate-y-[2px] font-bold text-slate-700 text-lg hover:bg-slate-50"
                        >
                            {num}
                        </button>
                    ))}
                </div>
            )}

            <div className="flex flex-col gap-2">
                {rows.map((row, idx) => (
                    <div key={idx} className="flex justify-center gap-2">
                        {row.map(char => (
                            <button
                                key={char}
                                onClick={() => onKeyPress(char)}
                                className="w-10 h-12 rounded-lg bg-white shadow-sm border-b-2 border-slate-200 active:border-b-0 active:translate-y-[2px] font-bold text-slate-700 text-lg hover:bg-slate-50"
                            >
                                {char}
                            </button>
                        ))}
                    </div>
                ))}
            </div>

            <div className="flex justify-center gap-4 mt-2">
                <button
                    onClick={() => onKeyPress(' ')}
                    className="flex-1 max-w-xs h-12 rounded-lg bg-white shadow-sm border-b-2 border-slate-200 active:border-b-0 active:translate-y-[2px] font-bold text-slate-500 text-sm hover:bg-slate-50 uppercase"
                >
                    ESPACIO
                </button>
                <div className="flex gap-2">
                    <button
                        onClick={onDelete}
                        className="w-16 h-12 rounded-lg bg-slate-200 shadow-sm border-b-2 border-slate-300 active:border-b-0 active:translate-y-[2px] flex items-center justify-center text-slate-600 hover:bg-slate-300"
                    >
                        <Delete size={20} />
                    </button>
                    <button
                        onClick={onClear}
                        className="w-16 h-12 rounded-lg bg-red-100 shadow-sm border-b-2 border-red-200 active:border-b-0 active:translate-y-[2px] flex items-center justify-center text-red-500 font-bold text-xs hover:bg-red-200"
                    >
                        BORRAR
                    </button>
                </div>
            </div>
        </div>
    );
};
