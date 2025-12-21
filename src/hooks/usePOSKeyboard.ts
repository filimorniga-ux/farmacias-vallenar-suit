import { useEffect, useState, useCallback } from 'react';

interface UsePOSKeyboardProps {
    resultsLength: number;
    onFocusSearch: () => void;
    onEscape: () => void;
}

export const usePOSKeyboard = ({
    resultsLength,
    onFocusSearch,
    onEscape
}: UsePOSKeyboardProps) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
        setSelectedIndex(0);
    }, [resultsLength]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'F2') {
            e.preventDefault();
            onFocusSearch();
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            onEscape();
            return;
        }
        if (resultsLength > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => (prev + 1) % resultsLength);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => (prev - 1 + resultsLength) % resultsLength);
            }
        }
    }, [resultsLength, onFocusSearch, onEscape]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    return { selectedIndex };
};
