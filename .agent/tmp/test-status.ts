import { getCashDrawerStatus } from '../../src/actions/cash-management-v2';
import { config } from 'dotenv';
config({ path: '.env' });

async function run() {
  const terminalId = '8153d107-d024-4c52-8c22-564f0d06c937';
  const res = await getCashDrawerStatus(terminalId);
  console.log(JSON.stringify(res, null, 2));
}
run();
