import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockRequireScopedActor,
    mockResolveEffectiveLocation,
    mockQuery,
    mockCheckRateLimit,
    mockCompare,
    mockGenerateReport,
} = vi.hoisted(() => ({
    mockRequireScopedActor: vi.fn(),
    mockResolveEffectiveLocation: vi.fn(),
    mockQuery: vi.fn(),
    mockCheckRateLimit: vi.fn(() => ({ allowed: true })),
    mockCompare: vi.fn(),
    mockGenerateReport: vi.fn(),
}));

vi.mock('@/actions/admin-scope', () => ({
    requireScopedActor: mockRequireScopedActor,
    resolveEffectiveLocation: mockResolveEffectiveLocation,
    AUDIT_VIEW_ROLES: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
    AUDIT_GLOBAL_ROLES: ['ADMIN', 'GERENTE_GENERAL'],
}));

vi.mock('@/lib/db', () => ({ query: mockQuery }));
vi.mock('@/lib/rate-limiter', () => ({ checkRateLimit: mockCheckRateLimit }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/excel-generator', () => ({
    ExcelService: vi.fn().mockImplementation(() => ({
        generateReport: mockGenerateReport,
    })),
}));
vi.mock('@/lib/timezone', () => ({
    formatDateTimeCL: vi.fn(() => '02-04-2026 10:00'),
    formatDateCL: vi.fn(() => '02-04-2026'),
}));
vi.mock('bcryptjs', () => ({
    default: {
        compare: mockCompare,
    },
}));

import * as auditV2 from '@/actions/audit-dashboard-v2';

describe('audit-dashboard-v2', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireScopedActor.mockResolvedValue({
            success: true,
            actor: {
                userId: 'u1',
                role: 'ADMIN',
                locationId: 'loc-1',
                userName: 'Admin',
                tokenVersion: 1,
                sessionToken: 'token',
            },
        });
        mockResolveEffectiveLocation.mockReturnValue({ success: true, locationId: 'loc-1' });
        mockGenerateReport.mockResolvedValue(Buffer.from('excel'));
        mockCompare.mockResolvedValue(true);
    });

    it('bloquea actores sin permisos antes de consultar la base', async () => {
        mockRequireScopedActor.mockResolvedValueOnce({
            success: false,
            error: 'Acceso denegado',
        });

        const result = await auditV2.getAuditLogsSecure({ page: 1, limit: 25 });

        expect(result).toEqual({
            success: false,
            error: 'Acceso denegado',
        });
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('requiere PIN administrativo para exportes masivos', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ total: 2000 }] });

        const result = await auditV2.exportAuditLogsSecure({ startDate: '2024-01-01' });

        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN');
        expect(mockGenerateReport).not.toHaveBeenCalled();
    });

    it('limita managers a su ubicación efectiva al listar auditoría', async () => {
        mockRequireScopedActor.mockResolvedValueOnce({
            success: true,
            actor: {
                userId: 'manager-1',
                role: 'MANAGER',
                locationId: 'loc-9',
                userName: 'Manager',
                tokenVersion: 1,
                sessionToken: 'token',
            },
        });
        mockResolveEffectiveLocation.mockReturnValueOnce({ success: true, locationId: 'loc-9' });
        mockQuery
            .mockResolvedValueOnce({ rows: [{ total: 0 }] })
            .mockResolvedValueOnce({ rows: [] });

        const result = await auditV2.getAuditLogsSecure({ page: 1, limit: 25 });

        expect(result.success).toBe(true);
        expect(mockQuery.mock.calls[0]?.[1]?.[0]).toBe('loc-9');
        expect(mockQuery.mock.calls[1]?.[1]).toEqual(['loc-9', 25, 0]);
    });
});
