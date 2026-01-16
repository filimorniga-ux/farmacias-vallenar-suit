const fs = require('fs');
const path = '/Users/miguelperdomoserrato/farmacias-vallenar-suit/src/actions/products-v2.ts';

try {
    const content = fs.readFileSync(path, 'utf8');
    const lines = content.split('\n');
    console.log(`Total lines before: ${lines.length}`);

    // Verification
    // Index 966 (Line 967) should have text
    console.log('Line 967 checks:', lines[966]);
    console.log('Line 1038 checks:', lines[1037]);

    if (lines[966].includes('Quick Create Product') && lines[1037].includes('Quick Create Product')) {
        // We want to delete logic block 1.
        // Block 1 starts at index 965 (Line 966 `/**`)
        // Block 2 starts at index 1036 (Line 1037 `/**`)
        // We want to delete from 965 up to (but not including) 1036.

        const newLines = [...lines.slice(0, 965), ...lines.slice(1036)];
        console.log(`Total lines after: ${newLines.length}`);
        fs.writeFileSync(path, newLines.join('\n'));
        console.log('File cleaned successfully');
    } else {
        console.error('Safety check failed again.');
    }

} catch (e) {
    console.error(e);
}
