import React from 'react';
import { X } from 'lucide-react';
import { InventoryExportForm } from '../reports/InventoryExportForm';

interface InventoryExportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const InventoryExportModal: React.FC<InventoryExportModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-lg text-gray-800">Exportar Inventario (Kardex)</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                <div className="p-6">
                    <InventoryExportForm />
                </div>
            </div>
        </div>
    );
};

export default InventoryExportModal;
