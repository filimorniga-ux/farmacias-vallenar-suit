
import React from 'react';

interface AlphabetFilterProps {
    onSelectLetter: (letter: string) => void;
    activeLetter?: string | null;
}

export const AlphabetFilter: React.FC<AlphabetFilterProps> = ({ onSelectLetter, activeLetter }) => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

    return (
        <div className="flex flex-wrap gap-1 justify-center p-2 bg-white/80 backdrop-blur rounded-2xl border border-slate-100 mb-4 shadow-sm">
            <button
                onClick={() => onSelectLetter('')}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${!activeLetter ? 'bg-cyan-500 text-white shadow-md shadow-cyan-200' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
            >
                ALL
            </button>
            {letters.map(letter => (
                <button
                    key={letter}
                    onClick={() => onSelectLetter(letter)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${activeLetter === letter ? 'bg-cyan-500 text-white shadow-md shadow-cyan-200 scale-110' : 'bg-slate-50 text-slate-500 hover:bg-slate-200'}`}
                >
                    {letter}
                </button>
            ))}
        </div>
    );
};
