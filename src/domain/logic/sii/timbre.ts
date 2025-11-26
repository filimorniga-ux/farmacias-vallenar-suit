/**
 * SII Timbre (TED) Generation Service
 * 
 * The TED (Timbre Electrónico Digital) is a required element in Chilean DTEs.
 * It's a digitally signed barcode that contains key information about the document.
 * 
 * Structure:
 * <TED version="1.0">
 *   <DD>
 *     <RE>RUT Emisor</RE>
 *     <TD>Tipo DTE</TD>
 *     <F>Folio</F>
 *     <FE>Fecha Emision</FE>
 *     <RR>RUT Receptor</RR>
 *     <RSR>Razon Social Receptor</RSR>
 *     <MNT>Monto</MNT>
 *     <IT1>Item 1</IT1>
 *     <CAF>...from DB...</CAF>
 *     <TSTED>Timestamp</TSTED>
 *   </DD>
 *   <FRMT algoritmo="SHA1withRSA">...firma...</FRMT>
 * </TED>
 */

import { SiiCaf } from '../../types';

export interface TimbreData {
    rutEmisor: string;
    tipoDte: number;
    folio: number;
    fechaEmision: string; // YYYY-MM-DD
    rutReceptor?: string;
    razonSocialReceptor?: string;
    monto: number;
    itemDescripcion: string;
}

/**
 * Generate TED XML node
 * @param data - The DTE data
 * @param caf - The CAF from database
 * @returns The <TED> XML string
 */
export function generateTED(data: TimbreData, caf: SiiCaf): string {
    try {
        // TODO: Implement real TED generation with CAF private key
        // 1. Build DD (Datos del Documento)
        const dd = `
        <DD>
            <RE>${data.rutEmisor}</RE>
            <TD>${data.tipoDte}</TD>
            <F>${data.folio}</F>
            <FE>${data.fechaEmision}</FE>
            ${data.rutReceptor ? `<RR>${data.rutReceptor}</RR>` : ''}
            ${data.razonSocialReceptor ? `<RSR>${data.razonSocialReceptor}</RSR>` : ''}
            <MNT>${data.monto}</MNT>
            <IT1>${data.itemDescripcion}</IT1>
            <CAF version="1.0">
                ${caf.xml_content}
            </CAF>
            <TSTED>${new Date().toISOString()}</TSTED>
        </DD>`;

        // 2. Sign DD with CAF private key
        // const privateKeyPEM = extractPrivateKeyFromCAF(caf.xml_content);
        // const signature = signWithRSA(dd, privateKeyPEM);

        // STUB: Return mock TED
        const mockSignature = 'MOCK_SIGNATURE_' + Buffer.from(dd).toString('base64').substring(0, 50);

        const ted = `
        <TED version="1.0">
            ${dd}
            <FRMT algoritmo="SHA1withRSA">${mockSignature}</FRMT>
        </TED>`;

        console.warn('⚠️  Using STUB TED generation. Implement real signing before production!');

        return ted;

    } catch (error) {
        console.error('Error generating TED:', error);
        return '';
    }
}

/**
 * Extract private key from CAF XML
 * (For real implementation)
 */
function extractPrivateKeyFromCAF(cafXml: string): string {
    // TODO: Parse CAF XML and extract <rsask> node
    // const parser = new DOMParser();
    // const doc = parser.parseFromString(cafXml, 'text/xml');
    // const rsask = doc.getElementsByTagName('RSASK')[0].textContent;
    // return convertToP EM(rsask);

    return 'MOCK_PRIVATE_KEY';
}

/**
 * Generate barcode-compatible TED string (PDF417)
 * This is what gets printed as a barcode on the paper DTE
 */
export function generateTEDBarcode(tedXml: string): string {
    // The barcode is the TED XML without whitespace, base64 encoded
    const cleaned = tedXml.replace(/\s+/g, ' ').trim();
    return Buffer.from(cleaned).toString('base64');
}
