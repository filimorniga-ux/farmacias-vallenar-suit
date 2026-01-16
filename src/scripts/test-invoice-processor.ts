
import dotenv from 'dotenv';
dotenv.config();
import { processInvoiceXML } from '../actions/procurement/process-invoice'; // Direct import might fail due to 'use server' if compiled by next, but let's try with ts-node

// Mock XML
const mockXML = `
<DTE version="1.0">
    <Documento ID="F33T33">
        <Encabezado>
            <IdDoc>
                <TipoDTE>33</TipoDTE>
                <Folio>123456</Folio>
            </IdDoc>
            <Emisor>
                <RUTEmisor>76.123.456-7</RUTEmisor>
                <RznSoc>LABORATORIO CHILE S.A.</RznSoc>
            </Emisor>
            <Receptor>
                <RUTRecep>12.345.678-9</RUTRecep>
            </Receptor>
            <Totales>
                <MntNeto>10000</MntNeto>
                <MntTotal>11900</MntTotal>
            </Totales>
        </Encabezado>
        <Detalle>
            <NroLinDet>1</NroLinDet>
            <NmbItem>PARACETAMOL 500MG</NmbItem>
            <QtyItem>100</QtyItem>
            <PrcItem>500</PrcItem>
        </Detalle>
        <Detalle>
            <NroLinDet>2</NroLinDet>
            <NmbItem>IBUPROFENO 400MG</NmbItem>
            <QtyItem>50</QtyItem>
            <PrcItem>800</PrcItem>
        </Detalle>
    </Documento>
</DTE>
`;

async function test() {
    console.log("🚀 Testing Smart Invoice Processor...");
    try {
        const result = await processInvoiceXML(mockXML);
        console.log("Result:", JSON.stringify(result, null, 2));

        if (result.success) {
            console.log("✅ Invoice processed successfully!");
            result.items?.forEach(item => {
                console.log(`   - Item: ${item.rawName} | Qty: ${item.qty} | Match: ${item.matchResult?.status}`);
                if (item.updatedStock) {
                    console.log(`     🎉 Stock UPDATED to: ${item.updatedStock}`);
                }
            });
        } else {
            console.error("❌ Processing failed:", result.message);
        }
    } catch (e) {
        console.error("❌ Script Error:", e);
    }
}

test();
