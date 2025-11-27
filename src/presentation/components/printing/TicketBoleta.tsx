import React from 'react';
import { SaleTransaction } from '../../../domain/types';
import { QrCode } from 'lucide-react';

interface TicketBoletaProps {
    sale: SaleTransaction;
    companyName?: string;
    companyRut?: string;
}

const TicketBoleta: React.FC<TicketBoletaProps> = ({ sale, companyName = 'FARMACIAS VALLENAR', companyRut = '76.123.456-7' }) => {
    const isDTE = sale.dte_status === 'CONFIRMED_DTE';
    const folio = sale.dte_folio || '000000';

    return (
        <div className="bg-white p-4 w-[300px] font-mono text-xs shadow-lg border border-slate-200 mx-auto my-4">
            {/* Header */}
            <div className="text-center mb-4 border-b border-dashed border-slate-300 pb-4">
                <h2 className="font-bold text-lg">{companyName}</h2>
                <p>{companyRut}</p>
                <p>Av. Matta 550, Vallenar</p>
                <p>Tel: +56 51 261 1234</p>
            </div>

            {/* Document Type */}
            <div className="text-center mb-4">
                {isDTE ? (
                    <>
                        <h3 className="font-bold text-base">BOLETA ELECTRÓNICA</h3>
                        <p className="text-sm">Nº {folio}</p>
                    </>
                ) : (
                    <>
                        <h3 className="font-bold text-base">COMPROBANTE INTERNO</h3>
                        <p className="text-[10px] font-bold mt-1">NO VÁLIDO COMO BOLETA</p>
                        <p className="text-[9px] mt-1 text-slate-500">Boleta válida entregada vía Voucher Transbank/Getnet</p>
                    </>
                )}
            </div>

            {/* Sale Details */}
            <div className="mb-4">
                <div className="flex justify-between mb-2">
                    <span>Fecha:</span>
                    <span>{new Date(sale.timestamp).toLocaleString()}</span>
                </div>
                {sale.customer && (
                    <div className="flex justify-between mb-2">
                        <span>Cliente:</span>
                        <span>{sale.customer.name}</span>
                    </div>
                )}
                {sale.payment_method === 'TRANSFER' && (
                    <div className="flex justify-between mb-2 font-bold">
                        <span>Pago:</span>
                        <span>Transferencia Electrónica</span>
                    </div>
                )}
            </div>

            {/* Items */}
            <div className="border-t border-dashed border-slate-300 py-2 mb-2">
                {sale.items.map((item, index) => (
                    <div key={index} className="flex justify-between mb-1">
                        <span className="truncate w-32">{item.quantity} x {item.name}</span>
                        <span>${(item.price * item.quantity).toLocaleString()}</span>
                    </div>
                ))}
            </div>

            {/* Totals */}
            <div className="border-t border-dashed border-slate-300 pt-2 mb-4">
                <div className="flex justify-between font-bold text-sm">
                    <span>TOTAL</span>
                    <span>${sale.total.toLocaleString()}</span>
                </div>
            </div>

            {/* Footer / Timbre */}
            <div className="text-center pt-4 border-t border-slate-200">
                {isDTE ? (
                    <div className="flex flex-col items-center gap-2">
                        <div className="border-2 border-slate-800 p-1">
                            <QrCode size={64} className="text-slate-800" />
                        </div>
                        <p className="text-[9px] uppercase font-bold">Timbre Electrónico SII</p>
                        <p className="text-[8px]">Res. 80 del 2014 - Verifique documento: www.sii.cl</p>
                    </div>
                ) : (
                    <div className="text-center">
                        <p className="text-[10px] font-bold text-slate-400">*** COPIA INTERNA ***</p>
                        <p className="text-[9px] text-slate-400 mt-1">Este documento es solo para control de inventario y caja.</p>
                    </div>
                )}
                <p className="text-[8px] mt-4 text-slate-400">Farmacias Vallenar - Sistema POS v2.1</p>
            </div>
        </div>
    );
};

export default TicketBoleta;
