
const patterns = [
    /X\s*(\d+)\s*(COMP|CAPS|UND|GOMITAS|SOBRES|SAT|TAB|CAP)/i,
    /(\d+)\s*(COMP|CAPS|GOMITAS|SOBRES|CAP)\b/i,
    /X\s*(\d+)$/i,
    /\bX\s*(\d+)\b(?!\s*(MG|G|ML|CM|MTS|YARDA))/i
];

const samples = [
    "LOPERAMIDA CLORHIDRATO 2MG. X6COMP LCH",
    "IBUPROFENO 600MG X 20 COMP",
    "PARACETAMOL 500MG X20",
    "TEST KIT X 1 UND",
    "JARABE X 100 ML"
];

console.log("Debugging Regex Patterns:");
samples.forEach(name => {
    let extracted = null;
    for (const p of patterns) {
        const match = name.match(p);
        if (match) {
            extracted = match[1];
            // console.log(`  Match: ${p} -> ${match[0]} (Units: ${match[1]})`);
            break;
        }
    }
    console.log(`"${name}" -> Units: ${extracted}`);
});
