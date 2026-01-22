const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const INPUT_VERTICAL = "/Users/miguelperdomoserrato/.gemini/antigravity/brain/825b48f6-199f-4d69-9368-1fbde05d8674/uploaded_image_1_1769045372524.png";
const INPUT_HORIZONTAL = "/Users/miguelperdomoserrato/.gemini/antigravity/brain/825b48f6-199f-4d69-9368-1fbde05d8674/uploaded_image_2_1769045372524.png";
const OUTPUT_DIR = path.resolve(__dirname, '../public');
const ASSETS_DIR = path.join(OUTPUT_DIR, 'assets');

async function processLogos() {
    console.log('🚀 Processing Logos...');

    // Ensure assets dir
    if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

    try {
        // 1. Save Main Logos
        await sharp(INPUT_VERTICAL).toFile(path.join(OUTPUT_DIR, 'logo-vertical.png'));
        console.log('✅ logo-vertical.png saved');

        await sharp(INPUT_HORIZONTAL).toFile(path.join(OUTPUT_DIR, 'logo-horizontal.png'));
        console.log('✅ logo-horizontal.png saved');

        // Save as 'logo.png' too for backward compat / landing header
        await sharp(INPUT_HORIZONTAL).toFile(path.join(OUTPUT_DIR, 'logo.png'));

        // 2. Extract Icon
        // Horizontal is 1024x321. Crop left 321x321.
        // Get metadata to confirm height
        const metaH = await sharp(INPUT_HORIZONTAL).metadata();
        const iconSize = metaH.height; // Should be ~321

        console.log(`Extracting icon from horizontal logo (Height: ${iconSize}px)...`);

        // Extract left square
        const iconBuffer = await sharp(INPUT_HORIZONTAL)
            .extract({ left: 0, top: 0, width: iconSize, height: iconSize })
            .toBuffer();

        await sharp(iconBuffer).toFile(path.join(OUTPUT_DIR, 'icon.png'));
        console.log('✅ icon.png (Square) saved');

        // 3. Generate Variants
        const variants = [
            { name: 'favicon.ico', size: 32 }, // Sharp can save as png, simple rename usually works for modern browsers, or use toFormat? sharp can't write .ico natively usually but let's try png and rename or strictly png
            // Browsers support png favicons. PWA manifest points to pngs.
            // For true .ico we need proper encoder, but let's save as 32x32 png which most browsers accept as favicon.ico if forced, or just save as favicon.png and rename?
            // Actually, best to just provide favicon.ico as a PNG renamed if we lack tools, or skip .ico if we rely on <link rel="icon" type="image/x-icon">.
            // Let's output .png for all. `favicon.ico` being a PNG file usually works in modern chrome/edge/safari.
            { name: 'apple-touch-icon.png', size: 180 },
            { name: 'android-chrome-192x192.png', size: 192 },
            { name: 'android-chrome-512x512.png', size: 512 }
        ];

        for (const v of variants) {
            await sharp(iconBuffer)
                .resize(v.size, v.size)
                .toFile(path.join(OUTPUT_DIR, v.name));
            console.log(`✅ ${v.name} generated`);
        }

        console.log('✨ All logos processed successfully!');

    } catch (error) {
        console.error('❌ Error processing logos:', error);
        process.exit(1);
    }
}

processLogos();
