
/**
 * Utility to parse product details from the product name string.
 * This is essential for "Inventory Batches" (Legacy Data) which lack structured columns
 * for units, laboratory, dci, etc.
 */

export function parseProductDetails(
    name: string,
    existingUnits: number = 1,
    existingDci: string | null = null,
    existingLab: string | null = null,
    existingFormat: string | null = null
) {
    if (!name) return { units: 1, dci: existingDci, lab: existingLab, format: existingFormat };

    const upperName = name.toUpperCase();
    let units = existingUnits;
    let dci = existingDci;
    let lab = existingLab;
    let format = existingFormat;

    // 1. EXTRACT UNITS
    // Strategy: Look for patterns like "X24", "X 30", "30 COMP", "30CAP", "X1"
    // Regex priority:
    // a) "X \d+" (e.g. X 10, X24) - High confidence
    // b) "\d+ COMP" or "\d+ CAP" or "\d+ UN" - Medium confidence

    if (!units || units === 1) {
        const xMatch = upperName.match(/\sX\s*(\d+)\b/); // Space X Space? Number
        const xNoSpaceMatch = upperName.match(/\sX(\d+)\b/); // Space XNumber
        const compMatch = upperName.match(/(\d+)\s*(?:COMP|CAPS|CÁPS|TAB|SOBRES|SUPOS|KN|OVULOS)\b/);

        if (xMatch) {
            units = parseInt(xMatch[1], 10);
        } else if (xNoSpaceMatch) {
            units = parseInt(xNoSpaceMatch[1], 10);
        } else if (compMatch) {
            units = parseInt(compMatch[1], 10);
        }
    }

    // 2. EXTRACT LAB
    // Look for "LAB." or "LABORATORIO"
    if (!lab || lab === 'Generico' || lab === 'NULL') {
        const labMatch = upperName.match(/(?:LAB\.|LABORATORIO)\s+([A-Z\.]+)/);
        if (labMatch) {
            lab = labMatch[1].trim(); // Get the word after LAB.
            // Often "LAB. CHILE", "LAB. SAVAL"
            // If the next word is suspiciously short, maybe grab two? 
            // For now, robust single word or simple logic.

            // Refinement: Grab everything after LAB. until end or next separator?
            // Usually LAB is at the end: "AMOXICILINA ... LAB CHILE"
            // Let's grab the rest of the string if it's near the end?
            // Simple regex update:
            const labFullMatch = upperName.match(/(?:LAB\.|LABORATORIO)\s+(.*)$/);
            if (labFullMatch) {
                lab = labFullMatch[1].trim();
            }
        }
    }

    // 3. EXTRACT DCI (Principio Activo)
    // If missing, heuristic: The first 1-2 words of the name are usually the DCI.
    // e.g. "AMOXICILINA 500MG..." -> AMOXICILINA
    // e.g. "LOSARTAN POTASICO..." -> LOSARTAN POTASICO
    if (!dci || dci === 'NULL') {
        // Exclude common prefixes if any (unlikely in this DB)
        const words = upperName.split(/\s+/);
        if (words.length > 0) {
            // Heuristic: Take first word. If second word is "SÓDICO", "POTÁSICO", "CALCICO", "COMPUESTO", include it.
            let inferredDci = words[0];
            if (words.length > 1) {
                const second = words[1];
                if (['SODICO', 'SÓDICO', 'POTASICO', 'POTÁSICO', 'CALCICO', 'CÁLCICO', 'COMPUESTO', 'PLUS', 'FORTE'].includes(second)) {
                    inferredDci += ' ' + second;
                }
            }
            // Filter out non-drug words if accidentally picked up (e.g. "PACK", "OFERTA") - keeping it simple for now
            dci = inferredDci;
        }
    }

    // 4. EXTRACT FORMAT
    // Look for "JARABE", "GOTAS", "COMP", "INY", "CREMA", "POMADA"
    if (!format || format === 'NULL') {
        if (upperName.includes('JARABE') || upperName.includes('JBE')) format = 'JARABE';
        else if (upperName.includes('GOTAS')) format = 'GOTAS';
        else if (upperName.includes('COMP') || upperName.includes('TAB')) format = 'COMPRIMIDOS';
        else if (upperName.includes('CAPS') || upperName.includes('CÁPS')) format = 'CÁPSULAS';
        else if (upperName.includes('INY')) format = 'INYECTABLE';
        else if (upperName.includes('CREMA')) format = 'CREMA';
        else if (upperName.includes('UNG')) format = 'ÜNGUENTO';
        else if (upperName.includes('GEL')) format = 'GEL';
        else if (upperName.includes('SOL')) format = 'SOLUCIÓN';
    }

    return {
        units: units || 1,
        dci: dci || 'Generico',
        lab: lab || 'Generico',
        format: format || '-'
    };
}
