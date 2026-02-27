import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Establecemos la ruta al servidor standalone generado por Next.js
const standaloneDir = path.join(__dirname, '.next', 'standalone');
const serverPath = path.join(standaloneDir, 'server.js');

console.log('--- Farmacias Vallenar Suit: Iniciando Servidor ---');
console.log('Modo: Standalone (Optimizado)');
console.log('Directorio:', standaloneDir);

// Importamos y ejecutamos el servidor de Next.js
// Cambiamos el directorio de trabajo para que Next.js encuentre .next/static y public
process.chdir(standaloneDir);
await import(serverPath);
