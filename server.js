import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Iniciamos el servidor standalone de Next.js
// Esta es la ruta donde Next.js genera el servidor cuando output: 'standalone' está activo
const standaloneServer = path.join(__dirname, '.next', 'standalone', 'server.js');

console.log('--- Iniciando Servidor Standalone de Next.js ---');
console.log('Ruta del servidor:', standaloneServer);

try {
    // Importamos el servidor generado por Next.js
    await import('./.next/standalone/server.js');
} catch (error) {
    console.error('ERROR: No se pudo encontrar el servidor standalone en .next/standalone/server.js');
    console.error('Asegúrate de que "output: standalone" esté en next.config.mjs');
    process.exit(1);
}
