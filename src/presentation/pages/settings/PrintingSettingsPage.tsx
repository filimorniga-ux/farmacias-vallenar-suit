import React from 'react';
import TicketDesigner from './components/TicketDesigner';
import { Printer } from 'lucide-react';

const PrintingSettingsPage: React.FC = () => {
    return (
        <div className="p-6">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                    <div className="p-2 bg-slate-900 rounded-lg text-white">
                        <Printer size={24} />
                    </div>
                    Configuración de Impresión
                </h1>
                <p className="text-slate-500 mt-1 ml-14">Personaliza el diseño de boletas y tickets.</p>
            </div>

            <TicketDesigner />
        </div>
    );
};

export default PrintingSettingsPage;
