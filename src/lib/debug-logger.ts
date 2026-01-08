
import fs from 'fs';
import path from 'path';

export const debugLog = (message: string) => {
    try {
        const logPath = path.join(process.cwd(), 'debug_quotes.log');
        const timestamp = new Date().toISOString();
        fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
    } catch (e) {
        // ignore
    }
};
