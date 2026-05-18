import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetActorOrFail = vi.fn();
const mockGetClient = vi.fn();

vi.mock('@/lib/db', () => ({
    getClient: (...args: unknown[]) => mockGetClient(...args),
}));

vi.mock('@/services/inventory-matcher', () => ({
    matchProduct: vi.fn(),
}));

vi.mock('@/services/invoice-mapper', () => ({
    InvoiceMapperService: {
        findBestMatch: vi.fn(),
    },
}));

vi.mock('@/services/ai-forecasting', () => ({
    AIForecastingService: {
        predictDemand: vi.fn(),
    },
}));

vi.mock('@/lib/pin-rbac', () => {
    const normalizeRole = (role: string | null | undefined) => String(role || '').trim().toUpperCase();

    class MockPinRbacError extends Error {
        code: string;

        constructor(code = 'AUTH_UNAUTHORIZED', message = 'Acceso denegado') {
            super(message);
            this.code = code;
        }
    }

    return {
        ROLE_GROUPS: {
            ADMIN: ['ADMIN', 'GERENTE_GENERAL'],
            MANAGER: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
        },
        PinRbacError: MockPinRbacError,
        normalizeRole,
        requireRole: (actor: Record<string, unknown>, allowedRoles: readonly string[]) => {
            const normalizedActor = { ...actor, role: normalizeRole(String(actor.role || '')) };
            const allowed = allowedRoles.map(normalizeRole);
            if (!allowed.includes(String(normalizedActor.role))) {
                throw new MockPinRbacError('AUTH_FORBIDDEN', 'Acceso denegado');
            }
            return normalizedActor;
        },
        getActorOrFail: (...args: unknown[]) => mockGetActorOrFail(...args),
    };
});

import { getReplenishmentSuggestions } from '@/actions/procurement/generate-order';
import { processInvoiceXML } from '@/actions/procurement/process-invoice';

describe('Procurement legacy routes hardening', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.ENABLE_LEGACY_PROCUREMENT_XML;
        delete process.env.ENABLE_LEGACY_PROCUREMENT_ORDERS;
        mockGetActorOrFail.mockResolvedValue({
            userId: '550e8400-e29b-41d4-a716-446655440111',
            role: 'ADMIN',
            userName: 'Admin Procurement',
            locationId: '550e8400-e29b-41d4-a716-446655440099',
            tokenVersion: 1,
            sessionToken: 'procurement-session',
        });
    });

    it('rechaza processInvoiceXML sin sesión válida', async () => {
        const UnauthorizedError = (await import('@/lib/pin-rbac')).PinRbacError as unknown as new (code?: string, message?: string) => Error;
        mockGetActorOrFail.mockRejectedValueOnce(new UnauthorizedError('AUTH_UNAUTHORIZED', 'Sesión no válida. Vuelve a iniciar sesión.'));

        const result = await processInvoiceXML('<xml />');

        expect(result.success).toBe(false);
        expect(result.message).toContain('Sesión no válida');
        expect(mockGetClient).not.toHaveBeenCalled();
    });

    it('mantiene processInvoiceXML deshabilitado por defecto', async () => {
        const result = await processInvoiceXML('<xml />');

        expect(result.success).toBe(false);
        expect(result.message).toContain('deshabilitado');
        expect(mockGetClient).not.toHaveBeenCalled();
    });

    it('devuelve vacío en generate-order legacy si el flag no está habilitado', async () => {
        const result = await getReplenishmentSuggestions('SANTIAGO');

        expect(result).toEqual([]);
        expect(mockGetClient).not.toHaveBeenCalled();
    });

    it('devuelve vacío en generate-order legacy sin auth', async () => {
        const UnauthorizedError = (await import('@/lib/pin-rbac')).PinRbacError as unknown as new (code?: string, message?: string) => Error;
        mockGetActorOrFail.mockRejectedValueOnce(new UnauthorizedError('AUTH_UNAUTHORIZED', 'Sesión no válida. Vuelve a iniciar sesión.'));

        const result = await getReplenishmentSuggestions('COLCHAGUA');

        expect(result).toEqual([]);
        expect(mockGetClient).not.toHaveBeenCalled();
    });
});
