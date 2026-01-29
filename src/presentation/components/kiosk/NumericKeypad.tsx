import React from 'react';
import { Delete } from 'lucide-react';

interface NumericKeypadProps {
    onDigit: (digit: string) => void;
    onDelete: () => void;
    onClear?: () => void;
    disabled?: boolean;
    className?: string;
}

export const NumericKeypad: React.FC<NumericKeypadProps> = ({
    onDigit,
    onDelete,
    disabled,
    className = ''
}) => {
    const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'DEL'];

    return (
        <div className={`grid grid-cols-3 gap-3 w-full max-w-[300px] mx-auto ${className}`}>
            {digits.map((digit, index) => {
                if (digit === '') return <div key={index} />;
                if (digit === 'DEL') return (
                    <button
                        key={index}
                        onClick={onDelete}
                        disabled={disabled}
                        className="h-16 rounded-2xl bg-slate-100 text-slate-500 hover:bg-slate-200 active:bg-slate-300 flex items-center justify-center transition-colors disabled:opacity-50 touch-manipulation active:scale-95"
                    >
                        <Delete size={24} />
                    </button>
                );
                return (
                    <button
                        key={index}
                        onClick={() => onDigit(digit)}
                        disabled={disabled}
                        className="h-16 rounded-2xl bg-white border border-slate-200 shadow-sm text-2xl font-bold text-slate-700 hover:bg-sky-50 hover:border-sky-200 active:bg-sky-100 active:scale-95 transition-all disabled:opacity-50 touch-manipulation select-none"
                    >
                        {digit}
                    </button>
                );
            })}
        </div>
    );
};
