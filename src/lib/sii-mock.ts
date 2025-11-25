export interface DTE {
    folio: number;
    fecha: string;
    total: number;
    neto: number;
    iva: number;
    items: any[];
    razon_social: string;
    rut_emisor: string;
    direccion: string;
    giro: string;
    track_id: string;
    estado: 'ACEPTADO' | 'RECHAZADO';
}

export async function emitirBoleta(total: number, items: any[]): Promise<DTE> {
    // Simular delay de red
    await new Promise((resolve) => setTimeout(resolve, 800));

    const neto = Math.round(total / 1.19);
    const iva = total - neto;

    return {
        folio: Math.floor(Math.random() * 100000) + 1,
        fecha: new Date().toISOString(),
        total,
        neto,
        iva,
        items,
        razon_social: 'FARMACIAS VALLENAR SPA',
        rut_emisor: '76.123.456-7',
        direccion: 'Calle Prat 123, Vallenar',
        giro: 'VENTA AL POR MENOR DE PRODUCTOS FARMACEUTICOS',
        track_id: crypto.randomUUID(),
        estado: 'ACEPTADO',
    };
}
