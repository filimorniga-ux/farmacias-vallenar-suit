import * as Sentry from '@sentry/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { getInternalDeepSeekTokenHeader } from '@/lib/ai/deepseek-endpoint';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BASE64_CHARS = 15 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 45_000;
const DEFAULT_UPSTREAM_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_MODEL = 'deepseek-chat';

const DeepSeekOCRRequestSchema = z.object({
    model: z.string().min(1).max(120).optional(),
    fileType: z.enum(['image', 'pdf']),
    imageBase64: z.string().min(100).max(MAX_BASE64_CHARS),
    prompt: z.string().min(20).max(20_000).optional(),
});

function getDeepSeekApiKey(): string | null {
    const candidates = [
        process.env.AI_DEEPSEEK_API_KEY,
        process.env.DEEPSEEK_API_KEY,
    ];

    for (const candidate of candidates) {
        const value = candidate?.trim();
        if (value) return value;
    }

    return null;
}

function resolveUpstreamUrl(): string {
    const configured = process.env.AI_DEEPSEEK_OCR_UPSTREAM_URL?.trim();
    if (!configured) return DEFAULT_UPSTREAM_URL;

    try {
        const parsed = new URL(configured);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return DEFAULT_UPSTREAM_URL;
        }
        return parsed.toString();
    } catch {
        return DEFAULT_UPSTREAM_URL;
    }
}

function getMimeType(fileType: 'image' | 'pdf'): string {
    return fileType === 'pdf' ? 'application/pdf' : 'image/jpeg';
}

function tryParseJsonObject(content: string): Record<string, unknown> | null {
    const direct = parseObject(content);
    if (direct) return direct;

    const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedMatch?.[1]) {
        const fenced = parseObject(fencedMatch[1]);
        if (fenced) return fenced;
    }

    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        const sliced = content.slice(firstBrace, lastBrace + 1);
        const extracted = parseObject(sliced);
        if (extracted) return extracted;
    }

    return null;
}

function parseObject(raw: string): Record<string, unknown> | null {
    try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
        return null;
    } catch {
        return null;
    }
}

function extractUsage(result: Record<string, unknown>): {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
} {
    const usage = result.usage;
    if (!usage || typeof usage !== 'object') {
        return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    }

    const usageRecord = usage as Record<string, unknown>;
    const prompt = Number(usageRecord.prompt_tokens ?? 0) || 0;
    const completion = Number(usageRecord.completion_tokens ?? 0) || 0;
    const total = Number(usageRecord.total_tokens ?? prompt + completion) || prompt + completion;

    return {
        prompt_tokens: prompt,
        completion_tokens: completion,
        total_tokens: total,
    };
}

function extractContent(result: Record<string, unknown>): string | null {
    const choices = result.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
        return null;
    }

    const firstChoice = choices[0];
    if (!firstChoice || typeof firstChoice !== 'object') {
        return null;
    }

    const message = (firstChoice as Record<string, unknown>).message;
    if (!message || typeof message !== 'object') {
        return null;
    }

    const content = (message as Record<string, unknown>).content;

    if (typeof content === 'string') return content;

    if (Array.isArray(content)) {
        const texts = content
            .filter((part): part is Record<string, unknown> => !!part && typeof part === 'object')
            .map((part) => {
                const text = part.text;
                return typeof text === 'string' ? text : null;
            })
            .filter((part): part is string => !!part);

        return texts.length > 0 ? texts.join('\n') : null;
    }

    return null;
}

function unauthorizedResponse() {
    return NextResponse.json(
        {
            success: false,
            error: 'No autorizado',
            code: 'DEEPSEEK_OCR_UNAUTHORIZED',
        },
        { status: 401 }
    );
}

export async function POST(request: NextRequest) {
    const expectedInternalToken = getInternalDeepSeekTokenHeader();
    if (expectedInternalToken) {
        const providedToken = request.headers.get('x-internal-ocr-token');
        if (providedToken !== expectedInternalToken) {
            return unauthorizedResponse();
        }
    }

    const bodyResult = await request.json().catch(() => null);
    const parsed = DeepSeekOCRRequestSchema.safeParse(bodyResult);

    if (!parsed.success) {
        return NextResponse.json(
            {
                success: false,
                error: parsed.error.issues[0]?.message || 'Payload inválido',
                code: 'DEEPSEEK_OCR_INVALID_PAYLOAD',
            },
            { status: 400 }
        );
    }

    const apiKey = getDeepSeekApiKey();
    if (!apiKey) {
        return NextResponse.json(
            {
                success: false,
                error: 'AI_DEEPSEEK_API_KEY no configurada en servidor',
                code: 'DEEPSEEK_OCR_KEY_MISSING',
            },
            { status: 500 }
        );
    }

    const upstreamUrl = resolveUpstreamUrl();
    const correlationId = randomUUID();
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const { fileType, imageBase64, prompt } = parsed.data;
        const model = parsed.data.model?.trim() || process.env.AI_DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL;
        const mimeType = getMimeType(fileType);

        const upstreamPayload = {
            model,
            temperature: 0.1,
            messages: [
                { role: 'system', content: prompt || 'Extrae información de factura y responde JSON válido.' },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Devuelve SOLO JSON válido sin markdown ni texto adicional.' },
                        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
                    ],
                },
            ],
            response_format: { type: 'json_object' },
        };

        const upstreamResponse = await fetch(upstreamUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(upstreamPayload),
            signal: controller.signal,
        });

        const upstreamJson = (await upstreamResponse.json().catch(() => ({}))) as Record<string, unknown>;

        if (!upstreamResponse.ok) {
            const message = extractContent(upstreamJson) || String(upstreamJson.error ?? upstreamResponse.statusText);

            logger.warn(
                {
                    correlationId,
                    status: upstreamResponse.status,
                    elapsedMs: Date.now() - start,
                },
                '[DeepSeek OCR] Upstream error'
            );

            return NextResponse.json(
                {
                    success: false,
                    error: `DeepSeek upstream error: ${message}`,
                    code: 'DEEPSEEK_OCR_UPSTREAM_ERROR',
                },
                { status: 502 }
            );
        }

        const structuredPayload = upstreamJson.data;
        if (structuredPayload && typeof structuredPayload === 'object' && !Array.isArray(structuredPayload)) {
            return NextResponse.json({
                success: true,
                data: structuredPayload,
                usage: extractUsage(upstreamJson),
            });
        }

        const content = extractContent(upstreamJson);
        if (!content) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Respuesta vacía del proveedor OCR',
                    code: 'DEEPSEEK_OCR_EMPTY_CONTENT',
                },
                { status: 502 }
            );
        }

        const parsedContent = tryParseJsonObject(content);
        if (!parsedContent) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'No se pudo interpretar JSON del OCR',
                    code: 'DEEPSEEK_OCR_INVALID_JSON',
                },
                { status: 502 }
            );
        }

        return NextResponse.json({
            success: true,
            data: parsedContent,
            usage: extractUsage(upstreamJson),
        });
    } catch (error) {
        Sentry.captureException(error, {
            tags: {
                module: 'deepseek-ocr-route',
            },
            extra: {
                correlationId,
                elapsedMs: Date.now() - start,
            },
        });

        const message =
            error instanceof Error && error.name === 'AbortError'
                ? 'Timeout al procesar OCR con DeepSeek'
                : `Error OCR DeepSeek: ${error instanceof Error ? error.message : 'desconocido'}`;

        logger.error(
            {
                correlationId,
                elapsedMs: Date.now() - start,
                error: error instanceof Error ? error.message : String(error),
            },
            '[DeepSeek OCR] Request failed'
        );

        return NextResponse.json(
            {
                success: false,
                error: message,
                code: 'DEEPSEEK_OCR_REQUEST_FAILED',
            },
            { status: 500 }
        );
    } finally {
        clearTimeout(timeout);
    }
}
