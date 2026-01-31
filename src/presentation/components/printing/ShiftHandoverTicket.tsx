import React from 'react';
import { type HandoverSummary } from '@/actions/shift-handover-v2';
import { ShieldCheck } from 'lucide-react';
import { TicketTemplate } from '../../../domain/types';

interface ShiftHandoverTicketProps {
    summary: HandoverSummary;
    userName: string;
    terminalName: string;
    locationName: string;
    timestamp: Date;
    template?: TicketTemplate; // New dynamic template
}

const ShiftHandoverTicket: React.FC<ShiftHandoverTicketProps> = ({ summary, userName, terminalName, locationName, timestamp, template }) => {
    const effectiveHeader = template?.header_content;
    const effectiveFooter = template?.footer_content;

    return (
        <div className="bg-white p-4 w-[300px] font-mono text-xs shadow-lg border border-slate-200 mx-auto my-4 print:shadow-none print:border-none print:w-full">
            {/* Header */}
            <div className="text-center mb-4 border-b border-dashed border-slate-300 pb-4">
                {effectiveHeader ? (
                    <div dangerouslySetInnerHTML={{ __html: effectiveHeader }} />
                ) : (
                    <>
                        <div className="flex justify-center mb-2">
                            <div className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center text-white font-bold text-xs print:text-black print:border-2 print:border-black print:bg-white">FV</div>
                        </div>
                        <h2 className="font-bold text-lg">FARMACIAS VALLENAR</h2>
                        <p>COMPROBANTE DE CIERRE</p>
                    </>
                )}
            </div>

            {/* Info */}
            <div className="mb-4 space-y-1">
                <div className="flex justify-between">
                    <span>Fecha:</span>
                    <span>{timestamp.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                    <span>Cajero:</span>
                    <span className="font-bold">{userName}</span>
                </div>
                <div className="flex justify-between">
                    <span>Terminal:</span>
                    <span>{terminalName}</span>
                </div>
                <div className="flex justify-between">
                    <span>Sucursal:</span>
                    <span>{locationName}</span>
                </div>
            </div>

            {/* Financial Content */}
            <div className="border-t border-dashed border-slate-300 py-2 mb-2">
                <div className="flex justify-between mb-1">
                    <span>Sistema Esperaba:</span>
                    <span>${(summary?.expectedCash ?? 0).toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between mb-1">
                    <span>Declarado:</span>
                    <span className="font-bold">${(summary?.declaredCash ?? 0).toLocaleString('es-CL')}</span>
                </div>
                {(summary?.diff ?? 0) !== 0 && (
                    <div className="flex justify-between mb-1 font-bold">
                        <span>Diferencia:</span>
                        <span className={(summary?.diff ?? 0) > 0 ? 'text-green-600' : 'text-red-600'}>
                            {(summary?.diff ?? 0) > 0 ? '+' : ''}{(summary?.diff ?? 0).toLocaleString('es-CL')}
                        </span>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="border-t border-dashed border-slate-300 py-2 mb-4 bg-slate-50 print:bg-white">
                <div className="flex justify-between mb-1 font-bold text-sm">
                    <span>RETIRO TESORERÍA:</span>
                    <span>${(summary?.amountToWithdraw ?? 0).toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between text-xs">
                    <span>Base Próx. Turno:</span>
                    <span>${(summary?.amountToKeep ?? 0).toLocaleString('es-CL')}</span>
                </div>
            </div>

            {/* Footer / Signatures */}
            <div className="mt-12 mb-4">
                <div className="border-t border-slate-400 w-3/4 mx-auto mb-2"></div>
                <p className="text-center text-[10px]">Firma Cajero Responsable</p>
            </div>

            <div className="mt-8 mb-4">
                <div className="border-t border-slate-400 w-3/4 mx-auto mb-2"></div>
                <p className="text-center text-[10px]">Firma Receptor Tesorería</p>
            </div>

            <div className="text-center text-[8px] text-slate-400 mt-4">
                {effectiveFooter ? (
                    <div dangerouslySetInnerHTML={{ __html: effectiveFooter }} />
                ) : (
                    <p>Este comprobante certifica la entrega de valores.</p>
                )}
                <p>Sistema POS v2.1 - {new Date().toLocaleTimeString()}</p>
            </div>
        </div>
    );
};

export default ShiftHandoverTicket;
