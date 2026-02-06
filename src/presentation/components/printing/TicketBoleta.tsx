import React from 'react';
import { SaleTransaction, TicketTemplate } from '../../../domain/types';
import { QrCode } from 'lucide-react';

// Define specific props for the component, extending or replacing domain types where necessary
interface TicketBoletaProps {
    sale: {
        timestamp: number;
        total: number;
        items: Array<{
            name: string;
            quantity: number;
            price: number;
        }>;
        payment_method: string;
        dte_folio?: string;
        dte_status?: string;
        seller_id?: string;
        customer?: {
            name: string;
            rut: string;
            totalPoints?: number;
            email?: string;
            phone?: string;
        };
        terminal_id?: string;
    };
    companyName?: string;
    companyRut?: string;
    isQuote?: boolean;
    template?: TicketTemplate;
    // Legacy support
    config?: {
        header_text?: string;
        show_logo?: boolean;
        footer_text?: string;
        show_barcode?: boolean;
    };
    cashierName?: string;
    branchName?: string;
}

const TicketBoleta: React.FC<TicketBoletaProps> = ({ sale, companyName = 'FARMACIAS VALLENAR', companyRut = '76.123.456-7', config, template, isQuote, cashierName, branchName }) => {
    const isDTE = sale.dte_status === 'CONFIRMED_DTE';
    const folio = sale.dte_folio || '000000';

    const effectiveHeader = template?.header_content;
    const effectiveFooter = template?.footer_content;
    const showLogo = template?.show_logo ?? config?.show_logo ?? true;

    // Helper to replace variables in HTML content
    const processContent = (html: string) => {
        if (!html) return '';
        let processed = html;

        // Support both {variable} and {{variable}}
        const replaceVar = (key: string, value: string) => {
            const regex = new RegExp(`{{?${key}}}?`, 'gi');
            processed = processed.replace(regex, value);
        };

        replaceVar('sucursal', branchName || 'CENTRAL');
        replaceVar('cajero', cashierName || 'SISTEMA');
        replaceVar('cliente', sale.customer?.name || 'Cliente Genérico');
        replaceVar('rut_cliente', sale.customer?.rut || 'Sin RUT');
        replaceVar('puntos', (sale.customer as any)?.totalPoints?.toString() || '0');

        replaceVar('fecha', new Date(sale.timestamp).toLocaleDateString('es-CL'));
        replaceVar('hora', new Date(sale.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }));
        replaceVar('folio', folio);

        // Fallback or explicit seller
        const seller = cashierName || (sale.seller_id ? 'Vendedor' : 'Cajero');
        replaceVar('vendedor', seller);

        return processed;
    };

    return (
        <div className="bg-white p-4 w-[300px] font-mono text-xs shadow-lg border border-slate-200 mx-auto my-4 print:shadow-none print:border-none print:w-full print:p-0">
            {/* Header - Left Aligned per Reference */}
            <div className="text-left mb-4 border-b-2 border-slate-800 pb-2">
                {effectiveHeader ? (
                    <div dangerouslySetInnerHTML={{ __html: processContent(effectiveHeader) }} />
                ) : (
                    <>
                        <h2 className="font-bold text-sm uppercase">{config?.header_text || companyName}</h2>
                        <p className="uppercase">{companyRut}</p>
                        <p className="uppercase">CASA MATRIZ PRAT 1085</p>
                        <p className="uppercase">SUCURSAL {branchName ? branchName.toUpperCase() : 'CENTRO'}</p>
                        <div className="mt-2 flex justify-between uppercase">
                            <span>CAJA N°: {sale.terminal_id || '1'}</span>
                            <span>VENDEDOR: {cashierName ? cashierName.toUpperCase() : 'SISTEMA'}</span>
                        </div>
                    </>
                )}
            </div>

            {/* Customer Info Section - Added Automatically */}
            {sale.customer && (
                <div className="mb-4 text-xs font-mono border-b border-dashed border-slate-400 pb-2">
                    <div className="flex justify-between uppercase">
                        <span className="font-bold">CLIENTE:</span>
                        <span>{sale.customer.name}</span>
                    </div>
                    {sale.customer.rut && (
                        <div className="flex justify-between uppercase">
                            <span>RUT:</span>
                            <span>{sale.customer.rut}</span>
                        </div>
                    )}
                    {sale.customer.totalPoints !== undefined && (
                        <div className="mt-1 pt-1 border-t border-dotted border-slate-300">
                            <div className="flex justify-between uppercase font-bold">
                                <span>PUNTOS TOTALES:</span>
                                <span>{sale.customer.totalPoints}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Date and Time - Reference Style */}
            <div className="mb-4 text-left uppercase">
                <div className="flex gap-4">
                    <p>{new Date(sale.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: true })}</p>
                    <p className="font-bold">FECHA DE EMISION: {new Date(sale.timestamp).toLocaleDateString('es-CL')}</p>
                </div>
            </div>

            {/* Document Title */}
            <div className="text-center mb-4 uppercase">
                {isQuote ? (
                    <h3 className="font-bold text-sm">DETALLE COTIZACIÓN</h3>
                ) : isDTE ? (
                    <h3 className="font-bold text-sm">DETALLE VENTA BOLETA N° {folio}</h3>
                ) : (
                    <h3 className="font-bold text-sm">DETALLE VENTA INT. {folio !== '000000' ? `N° ${folio}` : ''}</h3>
                )}
            </div>

            {/* Items Header */}
            <div className="flex justify-between border-b border-black mb-1 pb-1 font-bold uppercase">
                <span>DETALLE VENTA</span>
            </div>

            {/* Items List - Reference Style */}
            <div className="mb-4">
                {sale.items.map((item, index) => (
                    <div key={index} className="mb-2">
                        <div className="uppercase font-bold">{item.name}</div>
                        <div className="flex justify-between">
                            <span>{item.quantity} x</span>
                            <span>${(item.price).toLocaleString('es-CL')}</span>
                            <span className="font-bold">${(item.price * item.quantity).toLocaleString('es-CL')}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Totals Section */}
            <div className="border-t-2 border-black pt-2 mb-4">
                <div className="flex justify-between uppercase text-xs mb-1">
                    <span>SUBTOTAL $</span>
                    <span>{sale.total.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between font-bold text-sm uppercase">
                    <span>TOTAL $</span>
                    <span>{sale.total.toLocaleString('es-CL')}</span>
                </div>
                {/* Payment Methods */}
                <div className="mt-2 text-xs uppercase">
                    <div className="flex justify-between">
                        <span>{sale.payment_method === 'CASH' ? 'EFECTIVO' : sale.payment_method === 'DEBIT' ? 'TARJETA DEBITO' : 'CREDITO'} $</span>
                        <span>{sale.total.toLocaleString('es-CL')}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>VUELTO $</span>
                        <span>0</span>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="text-center pt-4 border-t border-slate-200 mt-8">
                <div className="mt-4 text-xs">
                    {effectiveFooter ? (
                        <div dangerouslySetInnerHTML={{ __html: processContent(effectiveFooter) }} />
                    ) : (
                        <p className="uppercase">{config?.footer_text || 'GRACIAS POR SU PREFERENCIA'}</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TicketBoleta;
