import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables (Local overrides first)
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const isCI = !!process.env.CI;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const useProdServer = process.env.PLAYWRIGHT_USE_PROD_SERVER === '1' || isCI;
const workerCount = process.env.PLAYWRIGHT_WORKERS
    ? Number(process.env.PLAYWRIGHT_WORKERS)
    : 1;
const cleanNodeOptions = (process.env.NODE_OPTIONS ?? '')
    .split(' ')
    .filter((flag) => !flag.startsWith('--localstorage-file'))
    .join(' ')
    .trim();

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 120000,
    outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? '/tmp/farmacias-playwright-test-results',
    fullyParallel: workerCount > 1,
    forbidOnly: isCI,
    retries: isCI ? 2 : 0,
    workers: workerCount,
    reporter: isCI
        ? 'dot'
        : [
            ['list'],
            [
                'html',
                {
                    outputFolder: process.env.PLAYWRIGHT_REPORT_DIR ?? '/tmp/farmacias-playwright-report',
                    open: 'never',
                },
            ],
        ],
    use: {
        baseURL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'on-first-retry',
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'mobile-landscape',
            use: {
                ...devices['iPhone 13 Landscape'],
                /* iPhone 13 Landscape is around 844 x 390. This forces tests into ultra-compact height */
            },
        },
    ],

    /* Run your local dev server before starting the tests */
    webServer: {
        command: useProdServer ? 'npm run build && npm run start' : 'npm run dev',
        url: baseURL,
        reuseExistingServer: true,
        timeout: useProdServer ? 420000 : 180000,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
            ...process.env,
            NODE_OPTIONS: cleanNodeOptions,
            NO_COLOR: '1',
            FORCE_COLOR: '0',
            SENTRY_SUPPRESS_INSTRUMENTATION_FILE_WARNING: '1',
            NODE_ENV: useProdServer ? 'production' : 'development',
        },
    },
});
