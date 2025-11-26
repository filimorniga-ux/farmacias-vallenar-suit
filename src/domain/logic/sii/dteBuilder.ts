/**
 * DTE (Documento Tributario Electrónico) Builder
 * 
 * Generates XML structure for:
 * - Boletas (Tipo 39)
 * - Facturas (Tipo 33)
 * - Notas de Crédito (Tipo 61)
 * - Notas de Débito (Tipo 56)
 */

import { SiiConfiguration, DteTipo } from '../../types';
import { generateTED, TimbreData } from './timbre';
import { SiiCaf } from '../../types';

export interface DteItem {
    numeroLinea: number;
    nombre: string;
    cantidad: number;
    precioUnitario: number;
    montoTotal: number;
}

export interface DteData {
    tipo: DteTipo;
    folio: number;
    fechaEmision: string; // YYYY-MM-DD

    // Emisor (from SiiConfiguration)
    rutEmisor: string;
    razonSocialEmisor: string;
    giroEmisor: string;
    acteco: number;
    direccionEmisor?: string;
    comunaEmisor?: string;

    // Receptor (Optional for Boletas)
    rutReceptor?: string;
    razonSocialReceptor?: string;
    giroReceptor?: string;
    direccionReceptor?: string;
    comunaReceptor?: string;

    // Items
    items: DteItem[];

    // Totales
    montoNeto: number;
    montoExento: number;
    iva: number;
    montoTotal: number;
}

/**
 * Build DTE XML
 */
export function buildDteXML(data: DteData, caf: SiiCaf): string {
    const { tipo, folio } = data;

    // TED
    const tedData: TimbreData = {
        rutEmisor: data.rutEmisor,
        tipoDte: tipo,
        folio,
        fechaEmision: data.fechaEmision,
        rutReceptor: data.rutReceptor,
        razonSocialReceptor: data.razonSocialReceptor,
        monto: data.montoTotal,
        itemDescripcion: data.items[0]?.nombre || 'Venta'
    };

    const ted = generateTED(tedData, caf);

    // Build XML structure according to SII schema
    const xml = `<?xml version="1.0" encoding="ISO-8859-1"?>
<DTE version="1.0">
    <Documento ID="DOC_${tipo}_${folio}">
        <Encabezado>
            <IdDoc>
                <TipoDTE>${tipo}</TipoDTE>
                <Folio>${folio}</Folio>
                <FchEmis>${data.fechaEmision}</FchEmis>
            </IdDoc>
            <Emisor>
                <RUTEmisor>${data.rutEmisor}</RUTEmisor>
                <RznSoc>${escapeXml(data.razonSocialEmisor)}</RznSoc>
                <GiroEmis>${escapeXml(data.giroEmisor)}</GiroEmis>
                <Acteco>${data.acteco}</Acteco>
                ${data.direccionEmisor ? `<DirOrigen>${escapeXml(data.direccionEmisor)}</DirOrigen>` : ''}
                ${data.comunaEmisor ? `<CmnaOrigen>${escapeXml(data.comunaEmisor)}</CmnaOrigen>` : ''}
            </Emisor>
            ${data.rutReceptor ? `
            <Receptor>
                <RUTRecep>${data.rutReceptor}</RUTRecep>
                <RznSocRecep>${escapeXml(data.razonSocialReceptor || '')}</RznSocRecep>
                ${data.giroReceptor ? `<GiroRecep>${escapeXml(data.giroReceptor)}</GiroRecep>` : ''}
                ${data.direccionReceptor ? `<DirRecep>${escapeXml(data.direccionReceptor)}</DirRecep>` : ''}
                ${data.comunaReceptor ? `<CmnaRecep>${escapeXml(data.comunaReceptor)}</CmnaRecep>` : ''}
            </Receptor>
            ` : ''}
            <Totales>
                ${data.montoNeto > 0 ? `<MntNeto>${data.montoNeto}</MntNeto>` : ''}
                ${data.montoExento > 0 ? `<MntExe>${data.montoExento}</MntExe>` : ''}
                <IVA>${data.iva}</IVA>
                <MntTotal>${data.montoTotal}</MntTotal>
            </Totales>
        </Encabezado>
        <Detalle>
            ${data.items.map(item => `
            <Item>
                <NroLinDet>${item.numeroLinea}</NroLinDet>
                <NmbItem>${escapeXml(item.nombre)}</NmbItem>
                <QtyItem>${item.cantidad}</QtyItem>
                <PrcItem>${item.precioUnitario}</PrcItem>
                <MontoItem>${item.montoTotal}</MontoItem>
            </Item>
            `).join('')}
        </Detalle>
        ${ted}
    </Documento>
</DTE>`;

    return xml;
}

/**
 * Calculate IVA (19% in Chile)
 */
export function calculateIVA(montoNeto: number): number {
    return Math.round(montoNeto * 0.19);
}

/**
 * Calculate Neto from Total (reverse IVA)
 */
export function calculateNetoFromTotal(montoTotal: number): number {
    return Math.round(montoTotal / 1.19);
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Generate DTE filename
 */
export function generateDteFilename(tipo: DteTipo, rut: string, folio: number): string {
    const tipoStr = tipo === 33 ? 'F' : tipo === 39 ? 'B' : tipo === 61 ? 'NC' : 'ND';
    const rutClean = rut.replace(/[.-]/g, '');
    return `DTE_${tipoStr}_${rutClean}_${folio}.xml`;
}
