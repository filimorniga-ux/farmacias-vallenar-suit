export const DEV_TEST_ACCOUNT = {
    name: '[DEV] Gerente General 1',
    email: 'dev.gerente.general.1@local.invalid',
    role: 'GERENTE_GENERAL',
    jobTitle: 'DEV_TEST_ACCOUNT',
    pin: '1213',
    ensureCommand: 'npm run dev-account:ensure',
    disableCommand: 'npm run dev-account:disable',
} as const;

export function printDevAccountSummary() {
    console.log(`   👤 Nombre: ${DEV_TEST_ACCOUNT.name}`);
    console.log(`   📧 Email: ${DEV_TEST_ACCOUNT.email}`);
    console.log(`   🛡 Rol: ${DEV_TEST_ACCOUNT.role}`);
    console.log(`   🏷 Marcador: ${DEV_TEST_ACCOUNT.jobTitle}`);
    console.log(`   🔑 PIN controlado: ${DEV_TEST_ACCOUNT.pin}`);
}

export function failLegacyUniversalPinScript(scriptName: string): never {
    console.error(`❌ ${scriptName} fue deshabilitado.`);
    console.error('Este script promovía el patrón legacy de PIN universal masivo (`1213`).');
    console.error(`Usa ${DEV_TEST_ACCOUNT.ensureCommand} para asegurar la cuenta DEV controlada.`);
    console.error(`Usa ${DEV_TEST_ACCOUNT.disableCommand} para desactivarla o rotar el PIN.`);
    process.exit(1);
}
