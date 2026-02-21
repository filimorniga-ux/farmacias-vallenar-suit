#!/usr/bin/env node

const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
const token = process.env.HEALTHCHECK_TOKEN;
const timeoutMs = Number(process.env.HEALTHCHECK_TIMEOUT_MS || '12000');

if (!appUrl) {
    console.error('APP_URL o NEXT_PUBLIC_APP_URL es requerido.');
    process.exit(1);
}

if (!token) {
    console.error('HEALTHCHECK_TOKEN es requerido.');
    process.exit(1);
}

const url = `${appUrl.replace(/\/$/, '')}/api/health/db`;
const controller = new AbortController();
const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

try {
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'x-health-token': token,
            'accept': 'application/json'
        },
        signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
        ? await response.json()
        : { success: false, error: await response.text() };
    const success = response.ok && payload?.success === true && payload?.status === 'ok';

    if (!success) {
        console.error('Healthcheck DB fallido:', JSON.stringify(payload));
        process.exit(2);
    }

    console.log(
        `Healthcheck DB OK: latency=${payload.dbLatencyMs}ms elapsed=${payload.elapsedMs}ms correlationId=${payload.correlationId}`
    );
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const finalMessage = message.includes('aborted')
        ? `Timeout alcanzado (${timeoutMs}ms) consultando healthcheck DB`
        : message;
    console.error(`Healthcheck DB error: ${finalMessage}`);
    process.exit(3);
} finally {
    clearTimeout(timeoutHandle);
}
