import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as scheduler from '@/actions/scheduler-v2';

vi.mock('@/lib/db', () => ({ query: vi.fn() }));
vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { mockHeaders, mockCookies } = vi.hoisted(() => ({
    mockHeaders: vi.fn(),
    mockCookies: vi.fn(),
}));

vi.mock('next/headers', () => ({
    headers: mockHeaders,
    cookies: mockCookies,
}));

describe('scheduler-v2', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockHeaders.mockResolvedValue(new Map([
            ['x-user-id', 'user-1'],
            ['x-user-role', 'MANAGER'],
            ['x-user-location', '550e8400-e29b-41d4-a716-446655440000'],
        ]) as any);
        mockCookies.mockResolvedValue({
            get: vi.fn(() => undefined),
        } as any);
    });

    it('rechaza cuando no hay sesión autenticada', async () => {
        mockHeaders.mockResolvedValue(new Map() as any);
        mockCookies.mockResolvedValue({ get: vi.fn(() => undefined) } as any);

        const result = await scheduler.generateDraftScheduleV2({
            locationId: '550e8400-e29b-41d4-a716-446655440000',
            weekStart: '2026-02-23',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No autenticado');
    });

    it('bloquea manager en sucursal ajena', async () => {
        const db = await import('@/lib/db');
        vi.mocked(db.query).mockResolvedValueOnce({
            rows: [
                {
                    id: 'user-1',
                    name: 'Manager 1',
                    role: 'MANAGER',
                    assigned_location_id: '550e8400-e29b-41d4-a716-446655440000',
                },
            ],
        } as any);

        const result = await scheduler.publishScheduleV2(
            '550e8400-e29b-41d4-a716-446655440001',
            '2026-02-23'
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('sucursal');
    });

    it('valida que colación no exceda duración del turno', async () => {
        const db = await import('@/lib/db');
        vi.mocked(db.query).mockResolvedValueOnce({
            rows: [
                {
                    id: 'user-1',
                    name: 'Manager 1',
                    role: 'MANAGER',
                    assigned_location_id: '550e8400-e29b-41d4-a716-446655440000',
                },
            ],
        } as any);

        const result = await scheduler.upsertShiftV2({
            userId: 'cashier-1',
            locationId: '550e8400-e29b-41d4-a716-446655440000',
            startAt: '2026-02-23T08:00:00.000Z',
            endAt: '2026-02-23T09:00:00.000Z',
            breakMinutes: 90,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Colación inválida');
    });

    it('evita solape de ausencias para el mismo colaborador', async () => {
        const db = await import('@/lib/db');
        vi.mocked(db.query)
            .mockResolvedValueOnce({
                rows: [{ assigned_location_id: '550e8400-e29b-41d4-a716-446655440000' }],
            } as any) // getTargetUserLocation
            .mockResolvedValueOnce({
                rows: [
                    {
                        id: 'user-1',
                        name: 'RRHH 1',
                        role: 'RRHH',
                        assigned_location_id: '550e8400-e29b-41d4-a716-446655440000',
                    },
                ],
            } as any) // authorizeScheduler
            .mockResolvedValueOnce({
                rows: [{ id: 'existing-timeoff' }],
            } as any); // overlap query

        const result = await scheduler.upsertTimeOffRequest({
            userId: 'cashier-1',
            type: 'VACATION',
            startDate: '2026-03-01',
            endDate: '2026-03-05',
            status: 'APPROVED',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Ya existe una ausencia');
    });

    it('publica borradores de semana exitosamente', async () => {
        const db = await import('@/lib/db');
        vi.mocked(db.query)
            .mockResolvedValueOnce({
                rows: [
                    {
                        id: 'user-1',
                        name: 'Manager 1',
                        role: 'MANAGER',
                        assigned_location_id: '550e8400-e29b-41d4-a716-446655440000',
                    },
                ],
            } as any) // authorizeScheduler
            .mockResolvedValueOnce({
                rowCount: 3,
                rows: [],
            } as any); // update publish

        const result = await scheduler.publishScheduleV2(
            '550e8400-e29b-41d4-a716-446655440000',
            '2026-02-23'
        );

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.count).toBe(3);
    });

    it('getScheduleData incluye template_color en turnos', async () => {
        const db = await import('@/lib/db');
        vi.mocked(db.query)
            .mockResolvedValueOnce({
                rows: [
                    {
                        id: 'user-1',
                        name: 'Manager 1',
                        role: 'MANAGER',
                        assigned_location_id: '550e8400-e29b-41d4-a716-446655440000',
                    },
                ],
            } as any) // authorizeScheduler
            .mockResolvedValueOnce({
                rows: [{ id: 'shift-1', user_id: 'cashier-1', template_color: '#22c55e' }],
            } as any) // shifts
            .mockResolvedValueOnce({ rows: [] } as any) // templates
            .mockResolvedValueOnce({ rows: [] } as any); // timeoffs

        const result = await scheduler.getScheduleData(
            '550e8400-e29b-41d4-a716-446655440000',
            '2026-02-23',
            '2026-03-01'
        );

        expect(result.shifts).toHaveLength(1);
        expect(result.shifts[0]?.template_color).toBe('#22c55e');
    });
});
