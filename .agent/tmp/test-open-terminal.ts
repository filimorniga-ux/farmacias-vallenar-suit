import { openTerminalWithPinValidation } from '../../src/actions/terminals-v2';
import { config } from 'dotenv';
config({ path: '.env' });

async function test() {
    const terminalId = '8153d107-d024-4c52-8c22-564f0d06c937'; // caja 3 stgo
    const userId = '1719073d-9da1-40d7-9dce-28ac3a415a6b'; // Gerente General 1
    const openingAmount = 50000;
    const supervisorPin = '1234'; // Assuming 1234 for test

    console.log('🚀 Testing openTerminalWithPinValidation...');
    const result = await openTerminalWithPinValidation(terminalId, userId, openingAmount, supervisorPin);
    console.log('Result:', JSON.stringify(result, null, 2));
}

test().catch(console.error);
