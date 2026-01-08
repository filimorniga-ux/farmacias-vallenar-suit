
import React from 'react';

interface QuotePrintProps {
    quote: any;
    ref?: React.Ref<HTMLDivElement>;
}

export const QuotePrintTemplate = React.forwardRef<HTMLDivElement, QuotePrintProps>(({ quote }, ref) => {
    if (!quote) return null;

    const logoUrl = '/assets/logo_vallenar.png'; // Make sure this exists or use text

    return (
        <div ref={ref} className="p-4 bg-white text-black font-mono text-xs w-[80mm] mx-auto print:w-full print:mx-0 print:text-black print:bg-white">
            {/* Header */}
            <div className="text-center mb-4">
                <h1 className="text-lg font-bold uppercase">Farmacias Vallenar</h1>
                <p className="text-[10px]">{quote.location_address || 'Casa Matriz'}</p>
                <div className="my-2 border-b border-black border-dashed" />
                <h2 className="text-sm font-bold">COTIZACIÓN</h2>
                <p className="text-sm font-bold">{quote.code}</p>
                <p className="text-[10px] mt-1">{new Date(quote.created_at).toLocaleString('es-CL')}</p>
            </div>

            {/* Customer */}
            <div className="mb-4">
                <p><span className="font-bold">Cliente:</span> {quote.customer_name || 'Particular'}</p>
                {quote.customer_phone && <p><span className="font-bold">Fono:</span> {quote.customer_phone}</p>}
                <p><span className="font-bold">Vendedor:</span> {quote.creator_name}</p>
            </div>

            {/* Items */}
            <div className="mb-4">
                <div className="border-b border-black mb-1 pb-1 flex justify-between font-bold">
                    <span>DESC</span>
                    <span>TOT</span>
                </div>
                {quote.items?.map((item: any) => (
                    <div key={item.id} className="mb-2">
                        <div className="uppercase">{item.product_name || item.name}</div>
                        <div className="flex justify-between">
                            <span>{item.quantity} x ${Number(item.unit_price).toLocaleString('es-CL')}</span>
                            <span>${Number(item.subtotal).toLocaleString('es-CL')}</span>
                        </div>
                        {item.discount > 0 && (
                            <div className="text-[10px] italic text-right">
                                (Desc. -${Number(item.subtotal * (item.discount / 100)).toLocaleString('es-CL')})
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Totals */}
            <div className="border-t border-black border-dashed pt-2 mb-6">
                <div className="flex justify-between mb-1">
                    <span>Subtotal:</span>
                    <span>${Number(quote.subtotal).toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between mb-1">
                    <span>Descuento:</span>
                    <span>-${Number(quote.discount).toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between text-base font-bold mt-2">
                    <span>TOTAL:</span>
                    <span>${Number(quote.total).toLocaleString('es-CL')}</span>
                </div>
            </div>

            {/* Footer */}
            <div className="text-center text-[10px]">
                <p className="font-bold mb-1">Válido hasta: {new Date(quote.valid_until).toLocaleDateString('es-CL')}</p>
                <p>Precios sujetos a cambio sin previo aviso.</p>
                <p>Stock sujeto a disponibilidad al momento de la compra.</p>
                <div className="mt-4 font-bold">*** GRACIAS POR SU PREFERENCIA ***</div>
            </div>
        </div>
    );
});

QuotePrintTemplate.displayName = 'QuotePrintTemplate';
