import { afterEach, describe, expect, it } from 'vitest';
import { resolveDeepSeekOcrEndpoint } from '@/lib/ai/deepseek-endpoint';

const ORIGINAL_ENV = {
    AI_DEEPSEEK_OCR_ENDPOINT: process.env.AI_DEEPSEEK_OCR_ENDPOINT,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    APP_URL: process.env.APP_URL,
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
};

function resetEnv() {
    if (ORIGINAL_ENV.AI_DEEPSEEK_OCR_ENDPOINT === undefined) {
        delete process.env.AI_DEEPSEEK_OCR_ENDPOINT;
    } else {
        process.env.AI_DEEPSEEK_OCR_ENDPOINT = ORIGINAL_ENV.AI_DEEPSEEK_OCR_ENDPOINT;
    }

    if (ORIGINAL_ENV.NEXT_PUBLIC_APP_URL === undefined) {
        delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
        process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_ENV.NEXT_PUBLIC_APP_URL;
    }

    if (ORIGINAL_ENV.APP_URL === undefined) {
        delete process.env.APP_URL;
    } else {
        process.env.APP_URL = ORIGINAL_ENV.APP_URL;
    }

    if (ORIGINAL_ENV.PUBLIC_APP_URL === undefined) {
        delete process.env.PUBLIC_APP_URL;
    } else {
        process.env.PUBLIC_APP_URL = ORIGINAL_ENV.PUBLIC_APP_URL;
    }
}

describe('resolveDeepSeekOcrEndpoint', () => {
    afterEach(() => {
        resetEnv();
    });

    it('prioriza endpoint configurado en DB', () => {
        process.env.AI_DEEPSEEK_OCR_ENDPOINT = 'https://env.example.com/ocr';
        process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

        const endpoint = resolveDeepSeekOcrEndpoint('https://db.example.com/ocr');
        expect(endpoint).toBe('https://db.example.com/ocr');
    });

    it('usa variable de entorno AI_DEEPSEEK_OCR_ENDPOINT cuando DB está vacío', () => {
        process.env.AI_DEEPSEEK_OCR_ENDPOINT = 'https://env.example.com/ocr';
        process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

        const endpoint = resolveDeepSeekOcrEndpoint(null);
        expect(endpoint).toBe('https://env.example.com/ocr');
    });

    it('usa ruta interna cuando no hay endpoint explícito', () => {
        delete process.env.AI_DEEPSEEK_OCR_ENDPOINT;
        process.env.NEXT_PUBLIC_APP_URL = 'https://farmaciasvallenarsuit.cl';

        const endpoint = resolveDeepSeekOcrEndpoint(null);
        expect(endpoint).toBe('https://farmaciasvallenarsuit.cl/api/ai/deepseek-ocr');
    });
});

