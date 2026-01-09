'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, FileImage, FileText, X, AlertCircle, Loader } from 'lucide-react';

// ============================================================================
// TIPOS
// ============================================================================

interface InvoiceUploaderProps {
    onFileSelected: (file: File, base64: string, fileType: 'image' | 'pdf') => void;
    isProcessing?: boolean;
    acceptedTypes?: string[];
    maxSizeMB?: number;
    className?: string;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const DEFAULT_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const DEFAULT_MAX_SIZE_MB = 10;

// ============================================================================
// COMPONENTE
// ============================================================================

export default function InvoiceUploader({
    onFileSelected,
    isProcessing = false,
    acceptedTypes = DEFAULT_ACCEPTED_TYPES,
    maxSizeMB = DEFAULT_MAX_SIZE_MB,
    className = '',
}: InvoiceUploaderProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [isConverting, setIsConverting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // Validar archivo
    const validateFile = (file: File): string | null => {
        if (!acceptedTypes.includes(file.type)) {
            return `Tipo de archivo no soportado. Use: ${acceptedTypes.map(t => t.split('/')[1]).join(', ')}`;
        }
        
        const maxBytes = maxSizeMB * 1024 * 1024;
        if (file.size > maxBytes) {
            return `El archivo excede el límite de ${maxSizeMB}MB`;
        }
        
        return null;
    };
    
    // Convertir archivo a base64
    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const result = reader.result as string;
                // Remover el prefijo "data:image/jpeg;base64,"
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = () => reject(new Error('Error leyendo archivo'));
        });
    };
    
    // Procesar archivo seleccionado
    const processFile = useCallback(async (file: File) => {
        setError(null);
        
        const validationError = validateFile(file);
        if (validationError) {
            setError(validationError);
            return;
        }
        
        setSelectedFile(file);
        setIsConverting(true);
        
        try {
            // Crear preview
            if (file.type.startsWith('image/')) {
                const previewUrl = URL.createObjectURL(file);
                setPreview(previewUrl);
            } else {
                setPreview(null); // PDF no tiene preview en esta versión
            }
            
            // Convertir a base64
            const base64 = await fileToBase64(file);
            const fileType = file.type === 'application/pdf' ? 'pdf' : 'image';
            
            onFileSelected(file, base64, fileType);
            
        } catch (err) {
            setError('Error procesando el archivo');
            console.error(err);
        } finally {
            setIsConverting(false);
        }
    }, [onFileSelected, acceptedTypes, maxSizeMB]);
    
    // Handlers de drag & drop
    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isProcessing) setIsDragging(true);
    };
    
    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };
    
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };
    
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        
        if (isProcessing) return;
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            processFile(files[0]);
        }
    };
    
    // Handler de input file
    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            processFile(files[0]);
        }
    };
    
    // Limpiar selección
    const handleClear = () => {
        setSelectedFile(null);
        setPreview(null);
        setError(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };
    
    // Render del estado actual
    const renderContent = () => {
        if (isProcessing || isConverting) {
            return (
                <div className="text-center py-8">
                    <Loader size={48} className="mx-auto text-purple-600 animate-spin mb-4" />
                    <p className="text-gray-900 font-medium">
                        {isConverting ? 'Preparando archivo...' : 'Analizando con IA...'}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                        {isProcessing && 'Esto puede tardar 10-30 segundos'}
                    </p>
                </div>
            );
        }
        
        if (selectedFile && preview) {
            return (
                <div className="relative">
                    <button
                        onClick={handleClear}
                        className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-md z-10"
                    >
                        <X size={16} />
                    </button>
                    <img 
                        src={preview} 
                        alt="Preview" 
                        className="max-h-64 mx-auto rounded-lg shadow-sm"
                    />
                    <p className="text-sm text-gray-500 mt-2 text-center">
                        {selectedFile.name}
                    </p>
                </div>
            );
        }
        
        if (selectedFile && !preview) {
            return (
                <div className="text-center py-4">
                    <FileText size={48} className="mx-auto text-red-500 mb-2" />
                    <p className="text-gray-900 font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-gray-500">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <button
                        onClick={handleClear}
                        className="mt-2 text-sm text-red-600 hover:text-red-700"
                    >
                        Cambiar archivo
                    </button>
                </div>
            );
        }
        
        return (
            <div className="text-center py-8">
                <Upload size={48} className="mx-auto text-gray-400 mb-4" />
                <p className="text-gray-900 font-medium">
                    Arrastra tu factura aquí
                </p>
                <p className="text-sm text-gray-500 mt-1">
                    o haz clic para seleccionar
                </p>
                <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                        <FileImage size={14} />
                        JPG, PNG
                    </span>
                    <span className="flex items-center gap-1">
                        <FileText size={14} />
                        PDF
                    </span>
                    <span>Máx. {maxSizeMB}MB</span>
                </div>
            </div>
        );
    };
    
    return (
        <div className={className}>
            <div
                onClick={() => !isProcessing && fileInputRef.current?.click()}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={`
                    relative border-2 border-dashed rounded-xl p-6 transition-all cursor-pointer
                    ${isDragging 
                        ? 'border-purple-500 bg-purple-50' 
                        : 'border-gray-300 hover:border-gray-400 bg-white'
                    }
                    ${isProcessing ? 'opacity-75 cursor-wait' : ''}
                `}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept={acceptedTypes.join(',')}
                    onChange={handleFileInput}
                    className="hidden"
                    disabled={isProcessing}
                />
                
                {renderContent()}
            </div>
            
            {error && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                    <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}
        </div>
    );
}
