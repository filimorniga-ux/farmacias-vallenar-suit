require('dotenv').config({ path: '.env.local' });
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
    const { electronPlatformName, appOutDir } = context;
    if (electronPlatformName !== 'darwin') {
        return;
    }

    const appName = context.packager.appInfo.productFilename;

    // Check if notarization credentials are present
    if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD) {
        console.warn('  ⚠️  Skipping notarization: APPLE_ID or APPLE_APP_SPECIFIC_PASSWORD not found in .env.local');
        return;
    }

    console.log(`  🍏 Notarizing ${appName}... (this can take several minutes)`);

    return await notarize({
        appBundleId: 'com.farmaciasvallenar.erp',
        appPath: `${appOutDir}/${appName}.app`,
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
        teamId: 'XY5KRY6FXK' // Team ID from certificate
    });
};
