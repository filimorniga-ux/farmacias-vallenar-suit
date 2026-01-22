const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
let png2icons;
try {
    png2icons = require('png2icons');
} catch (e) {
    console.warn('⚠️ png2icons not found, skipping .ico/.icns generation');
}

const RESOURCES_DIR = path.resolve(__dirname, '../resources');

const INPUT_VERTICAL = "/Users/miguelperdomoserrato/.gemini/antigravity/brain/825b48f6-199f-4d69-9368-1fbde05d8674/uploaded_image_1_1769045372524.png";
const INPUT_HORIZONTAL = "/Users/miguelperdomoserrato/.gemini/antigravity/brain/825b48f6-199f-4d69-9368-1fbde05d8674/uploaded_image_2_1769045372524.png";
const OUTPUT_DIR = path.resolve(__dirname, '../public');
const ASSETS_DIR = path.join(OUTPUT_DIR, 'assets');

async function processLogos() {
    console.log('🚀 Processing Logos V2 (Platform Icons)...');

    // Ensure Dirs
    if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });
    if (!fs.existsSync(RESOURCES_DIR)) fs.mkdirSync(RESOURCES_DIR, { recursive: true });

    try {
        // 1. Save Main Logos (Refresh)
        await sharp(INPUT_VERTICAL).toFile(path.join(OUTPUT_DIR, 'logo-vertical.png'));
        await sharp(INPUT_HORIZONTAL).toFile(path.join(OUTPUT_DIR, 'logo-horizontal.png'));
        await sharp(INPUT_HORIZONTAL).toFile(path.join(OUTPUT_DIR, 'logo.png'));
        console.log('✅ Base logos refreshed');

        // 2. Extract Icon (321x321 native)
        const metaH = await sharp(INPUT_HORIZONTAL).metadata();
        const iconSize = metaH.height;
        const iconBufferSmall = await sharp(INPUT_HORIZONTAL)
            .extract({ left: 0, top: 0, width: iconSize, height: iconSize })
            .toBuffer();

        // Save standard icon.png (Upscaled to 512x512 for better generic usage)
        const iconBuffer512 = await sharp(iconBufferSmall).resize(512, 512, { kernel: sharp.kernel.lanczos3 }).toBuffer();
        await sharp(iconBuffer512).toFile(path.join(OUTPUT_DIR, 'icon.png'));
        console.log('✅ public/icon.png (512x512) saved');

        // 3. Generate Platform Specifics (Electron)
        if (png2icons) {
            // Upscale to 1024x1024 for best results with png2icons
            const iconBuffer1024 = await sharp(iconBufferSmall).resize(1024, 1024, { kernel: sharp.kernel.lanczos3 }).toBuffer();

            // Create ICNS (Mac)
            const icns = png2icons.createICNS(iconBuffer1024, png2icons.BICUBIC, 0);
            if (icns) {
                fs.writeFileSync(path.join(OUTPUT_DIR, 'icon.icns'), icns);
                console.log('✅ public/icon.icns (Mac) saved');
            }

            // Create ICO (Windows)
            // png2icons.createICO produces a valid ICO with multiple sizes
            const ico = png2icons.createICO(iconBuffer1024, png2icons.BICUBIC, 0, false);
            if (ico) {
                fs.writeFileSync(path.join(OUTPUT_DIR, 'icon.ico'), ico);
                console.log('✅ public/icon.ico (Windows) saved');
            }

            // 4. Capacitor Resources
            // resources/icon.png (1024x1024)
            await sharp(iconBuffer1024).toFile(path.join(RESOURCES_DIR, 'icon.png'));
            console.log('✅ resources/icon.png saved');

            // resources/splash.png (2732x2732) - White background with centered icon (standard safe approach)
            await sharp({
                create: {
                    width: 2732,
                    height: 2732,
                    channels: 4,
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                }
            })
                .composite([{
                    input: iconBuffer1024,
                    gravity: 'center'
                }])
                .toFile(path.join(RESOURCES_DIR, 'splash.png'));
            console.log('✅ resources/splash.png saved');
        }

        // 5. PWA / Web Icons
        const variants = [
            { name: 'favicon.ico', size: 32 }, // Overwrite with PNG 32x32 for browser compat
            { name: 'apple-touch-icon.png', size: 180 },
            { name: 'android-chrome-192x192.png', size: 192 },
            { name: 'android-chrome-512x512.png', size: 512 }
        ];

        for (const v of variants) {
            await sharp(iconBufferSmall)
                .resize(v.size, v.size)
                .toFile(path.join(OUTPUT_DIR, v.name));
            console.log(`✅ ${v.name} generated`);
        }

        console.log('✨ All platform icons processed successfully!');

    } catch (error) {
        console.error('❌ Error processing logos:', error);
        process.exit(1);
    }
}

processLogos();
