import React, { useRef, useEffect } from 'react';
import { Bold, Italic, AlignCenter, AlignLeft, AlignRight, Image as ImageIcon, Variable } from 'lucide-react';

interface SimpleWysiwygProps {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    label?: string;
    availableVariables?: { key: string, label: string }[];
}

const SimpleWysiwyg: React.FC<SimpleWysiwygProps> = ({ value, onChange, placeholder, label, availableVariables }) => {
    const editorRef = useRef<HTMLDivElement>(null);

    // Sync external value to editor ONLY if focused is false or empty (to avoid cursor jumps)
    useEffect(() => {
        if (editorRef.current && editorRef.current.innerHTML !== value) {
            // Simple check to avoid overwriting while typing if content matches closely, 
            // but real sync needs care. For this simple version, we stick to onBlur updating 
            // the parent or controlled input logic carefully.
            // A safer approach for "contentEditable" is allowing divergence while active.
            if (document.activeElement !== editorRef.current) {
                editorRef.current.innerHTML = value;
            }
        }
    }, [value]);

    const handleInput = () => {
        if (editorRef.current) {
            onChange(editorRef.current.innerHTML);
        }
    };

    const execCmd = (command: string, value?: string) => {
        document.execCommand(command, false, value);
        handleInput(); // Trigger update
        editorRef.current?.focus();
    };

    const insertVariable = (variableKey: string) => {
        const span = `<span class="variable-tag px-1 bg-yellow-100 border border-yellow-300 rounded text-xs font-mono select-none" contenteditable="false">{{${variableKey}}}</span>&nbsp;`;
        document.execCommand('insertHTML', false, span);
        handleInput();
    };

    return (
        <div className="border border-slate-300 rounded-lg overflow-hidden bg-white">
            {label && <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">{label}</div>}

            {/* Toolbar */}
            <div className="flex items-center gap-1 p-2 border-b border-slate-100 bg-slate-50/50 flex-wrap">
                <button
                    onClick={() => execCmd('bold')}
                    className="p-1.5 hover:bg-slate-200 rounded text-slate-700"
                    title="Negrita"
                >
                    <Bold size={16} />
                </button>
                <button
                    onClick={() => execCmd('italic')}
                    className="p-1.5 hover:bg-slate-200 rounded text-slate-700"
                    title="Cursiva"
                >
                    <Italic size={16} />
                </button>
                <div className="w-px h-4 bg-slate-300 mx-1"></div>

                <button
                    onClick={() => execCmd('justifyLeft')}
                    className="p-1.5 hover:bg-slate-200 rounded text-slate-700"
                    title="Alinear Izquierda"
                >
                    <AlignLeft size={16} />
                </button>
                <button
                    onClick={() => execCmd('justifyCenter')}
                    className="p-1.5 hover:bg-slate-200 rounded text-slate-700"
                    title="Centrar"
                >
                    <AlignCenter size={16} />
                </button>
                <button
                    onClick={() => execCmd('justifyRight')}
                    className="p-1.5 hover:bg-slate-200 rounded text-slate-700"
                    title="Alinear Derecha"
                >
                    <AlignRight size={16} />
                </button>

                <div className="w-px h-4 bg-slate-300 mx-1"></div>

                {/* Variables Dropdown */}
                {availableVariables && availableVariables.length > 0 && (
                    <div className="relative group">
                        <button className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 rounded text-slate-700">
                            <Variable size={14} /> Variables
                        </button>
                        <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-xl border border-slate-200 hidden group-hover:block z-50 max-h-48 overflow-y-auto">
                            {availableVariables.map((v) => (
                                <button
                                    key={v.key}
                                    onClick={() => insertVariable(v.key)}
                                    className="block w-full text-left px-3 py-2 text-xs hover:bg-slate-50 text-slate-700"
                                >
                                    <span className="font-bold text-slate-900">{v.label}</span>
                                    <br />
                                    <span className="font-mono text-[10px] text-slate-400">{'{{' + v.key + '}}'}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Editable Area */}
            <div
                ref={editorRef}
                contentEditable
                onInput={handleInput}
                className="p-4 min-h-[120px] max-h-[300px] overflow-y-auto outline-none prose prose-sm max-w-none text-slate-800 font-mono text-sm leading-snug"
                style={{ fontFamily: "'Courier New', Courier, monospace" }} // Simulate thermal font somewhat
            />
            {placeholder && !value && (
                <div className="absolute pointer-events-none p-4 text-slate-300 text-sm font-mono top-[80px]">
                    {placeholder}
                </div>
            )}
        </div>
    );
};

export default SimpleWysiwyg;
