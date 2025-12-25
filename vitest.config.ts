import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'node',
        globals: true,
        alias: {
            '@': path.resolve(__dirname, './src'),
            'server-only': path.resolve(__dirname, './tests/__mocks__/server-only.ts'),
        },
        exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            exclude: [
                'node_modules/',
                'dist/',
                '.next/',
                '**/*.d.ts',
                '**/*.config.*',
                'tests/**',
            ],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            'server-only': path.resolve(__dirname, './tests/__mocks__/server-only.ts'),
        },
    },
});

