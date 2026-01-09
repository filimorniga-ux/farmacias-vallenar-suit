'use client';

import { useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2, RotateCw, FileText } from 'lucide-react';

// ============================================================================
// TIPOS
// ============================================================================

interface InvoiceViewerProps {
    fileUrl: string | null;
    fileType: 'image' | 'pdf';
    fileName?: string;
    className?: string;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const ZOOM_LEVELS = [50, 75, 100, 125, 150, 200];
const DEFAULT_ZOOM = 100;

// ============================================================================
// COMPONENTE
// ============================================================================

export default function InvoiceViewer({
    fileUrl,
    fileType,
    fileName,
    className = '',
}: InvoiceViewerProps) {
    const [zoom, setZoom] = useState(DEFAULT_ZOOM);
    const [rotation, setRotation] = useState(0);
    
    // Handlers
    const handleZoomIn = () => {
        const currentIndex = ZOOM_LEVELS.indexOf(zoom);
        if (currentIndex < ZOOM_LEVELS.length - 1) {
            setZoom(ZOOM_LEVELS[currentIndex + 1]);
        }
    };
    
    const handleZoomOut = () => {
        const currentIndex = ZOOM_LEVELS.indexOf(zoom);
        if (currentIndex > 0) {
            setZoom(ZOOM_LEVELS[currentIndex - 1]);
        }
    };
    
    const handleRotate = () => {
        setRotation((prev) => (prev + 90) % 360);
    };
    
    const handleFullscreen = () => {
        if (fileUrl) {
            window.open(fileUrl, '_blank');
        }
    };
    
    // Render placeholder
    if (!fileUrl) {
        return (
            <div className={`flex items-center justify-center bg-gray-100 rounded-xl ${className}`}>
                <div className="text-center p-8">
                    <FileText size={64} className="mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-500">Suba una factura para visualizarla</p>
                </div>
            </div>
        );
    }
    
    return (
        <div className={`flex flex-col bg-gray-100 rounded-xl overflow-hidden ${className}`}>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 bg-gray-200 border-b border-gray-300">
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleZoomOut}
                        disabled={zoom === ZOOM_LEVELS[0]}
                        className="p-1.5 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Alejar"
                    >
                        <ZoomOut size={18} />
                    </button>
                    <span className="text-sm font-medium w-12 text-center">{zoom}%</span>
                    <button
                        onClick={handleZoomIn}
                        disabled={zoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
                        className="p-1.5 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Acercar"
                    >
                        <ZoomIn size={18} />
                    </button>
                </div>
                
                <div className="flex items-center gap-2">
                    {fileType === 'image' && (
                        <button
                            onClick={handleRotate}
                            className="p-1.5 rounded hover:bg-gray-300 transition-colors"
                            title="Rotar"
                        >
                            <RotateCw size={18} />
                        </button>
                    )}
                    <button
                        onClick={handleFullscreen}
                        className="p-1.5 rounded hover:bg-gray-300 transition-colors"
                        title="Pantalla completa"
                    >
                        <Maximize2 size={18} />
                    </button>
                </div>
            </div>
            
            {/* Viewer */}
            <div className="flex-1 overflow-auto p-4">
                {fileType === 'image' ? (
                    <div className="flex items-center justify-center min-h-full">
                        <img
                            src={fileUrl}
                            alt={fileName || 'Factura'}
                            className="max-w-full shadow-lg rounded transition-transform duration-200"
                            style={{
                                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                                transformOrigin: 'center center',
                            }}
                        />
                    </div>
                ) : (
                    <div className="h-full min-h-[500px]">
                        <iframe
                            src={fileUrl}
                            title={fileName || 'Factura PDF'}
                            className="w-full h-full rounded border border-gray-300"
                            style={{
                                transform: `scale(${zoom / 100})`,
                                transformOrigin: 'top left',
                                width: `${10000 / zoom}%`,
                                height: `${10000 / zoom}%`,
                            }}
                        />
                    </div>
                )}
            </div>
            
            {/* Footer with filename */}
            {fileName && (
                <div className="px-4 py-2 bg-gray-200 border-t border-gray-300">
                    <p className="text-xs text-gray-600 truncate">{fileName}</p>
                </div>
            )}
        </div>
    );
}
