import { formatCurrency } from '@/lib/utils';
import { QrCode } from 'lucide-react';

interface TicketItem {
    nombre: string;
    cantidad: number;
    precio: number;
    total: number;
}

interface TicketData {
    folio: number;
    fecha: string;
    items: TicketItem[];
    total: number;
    neto: number;
    iva: number;
    razon_social: string;
    rut_emisor: string;
    direccion: string;
    giro: string;
}

interface BoletaTicketProps {
    data: TicketData;
}

export default function BoletaTicket({ data }: BoletaTicketProps) {
    return (
        <div className="bg-white p-4 w-[300px] mx-auto text-black font-mono text-xs print-only">
            {/* Header */}
            <div className="text-center mb-4">
                <h1 className="font-bold text-lg uppercase">{data.razon_social}</h1>
                <p>RUT: {data.rut_emisor}</p>
                <p>{data.giro}</p>
                <p>{data.direccion}</p>
                <p>Fono: +56 51 261 2345</p>
            </div>

            {/* DTE Info */}
            <div className="text-center border-t border-b border-black py-2 mb-4">
                <h2 className="font-bold text-sm">BOLETA ELECTRÓNICA</h2>
                <p className="text-lg font-bold">Nº {data.folio}</p>
                <p>S.I.I. - VALLENAR</p>
                <p className="mt-1">Fecha: {new Date(data.fecha).toLocaleString()}</p>
            </div>

            {/* Items */}
            <div className="mb-4">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-black border-dashed">
                            <th className="py-1 w-8">Cant</th>
                            <th className="py-1">Desc</th>
                            <th className="py-1 text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.items.map((item, index) => (
                            <tr key={index}>
                                <td className="py-1 align-top">{item.cantidad}</td>
                                <td className="py-1 align-top">{item.nombre}</td>
                                <td className="py-1 align-top text-right">{formatCurrency(item.total)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Totals */}
            <div className="border-t border-black border-dashed pt-2 mb-4">
                <div className="flex justify-between">
                    <span>Neto:</span>
                    <span>{formatCurrency(data.neto)}</span>
                </div>
                <div className="flex justify-between">
                    <span>IVA (19%):</span>
                    <span>{formatCurrency(data.iva)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm mt-1">
                    <span>TOTAL:</span>
                    <span>{formatCurrency(data.total)}</span>
                </div>
            </div>

            {/* Timbre Electrónico (Mock) */}
            <div className="flex flex-col items-center justify-center mb-4">
                <div className="border-2 border-black p-2 mb-1">
                    <QrCode size={64} className="text-black" />
                </div>
                <p className="text-[10px] uppercase text-center">
                    Timbre Electrónico SII<br />
                    Res. 80 de 2014 - Verifique documento: www.sii.cl
                </p>
            </div>

            {/* Footer */}
            <div className="text-center">
                <p className="font-bold">¡GRACIAS POR SU PREFERENCIA!</p>
                <p className="text-[10px] mt-1">Copia Cliente</p>
            </div>
        </div>
    );
}
