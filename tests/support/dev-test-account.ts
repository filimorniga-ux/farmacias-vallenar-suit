import { DEV_TEST_ACCOUNT } from '../../src/scripts/dev-account-support';

export const DEV_TEST_LOGIN = {
    user: DEV_TEST_ACCOUNT.name.replace(/^\[DEV\]\s*/, ''),
    pin: process.env.E2E_DEV_PIN || DEV_TEST_ACCOUNT.pin,
} as const;
