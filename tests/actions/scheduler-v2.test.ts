import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as scheduler from '@/actions/scheduler-v2';
import { getValidatedSession } from '@/lib/server-session';
import { query } from '@/lib/db';

vi.mock('@/lib/db', () => ({ query: vi.fn() }));
vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server-session', () => ({
    getValidatedSession: vi.fn(),
}));

const LOC_A = '550e8400-e29b-41d4-a716-446655440000';
const LOC_B = '550e8400-e29b-41d4-a716-446655440001';

function actorRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        id: 'user-1',
        name: 'Manager 1',
        role: 'MANAGER',
        assigned_location_id: LOC_A,
        ...overrides,
    };
}

describe('scheduler-v2', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(query).mockReset();
        vi.mocked(getValidatedSession).mockResolvedValue({
            userId: 'user-1',
            role: 'MANAGER',
            userName: 'Manager 1',
            locationId: LOC_A,
            tokenVersion: 1,
            sessionToken: 'token',
        });
    });

    it('rechaza cuando no hay sesión autenticada', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce(null);

        const result = await scheduler.generateDraftScheduleV2({
            locationId: '550e8400-e29b-41d4-a716-446655440000',
            weekStart: '2026-02-23',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No autenticado');
    });

    it('bloquea manager en sucursal ajena', async () => {
        vi.mocked(query).mockResolvedValueOnce({
            rows: [
                {
                    id: 'user-1',
                    name: 'Manager 1',
                    role: 'MANAGER',
                    assigned_location_id: LOC_A,
                },
            ],
        } as any);

        const result = await scheduler.publishScheduleV2(
            LOC_B,
            '2026-02-23'
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('sucursal');
    });

    it('valida que colación no exceda duración del turno', async () => {
        vi.mocked(query).mockResolvedValueOnce({
            rows: [
                {
                    id: 'user-1',
                    name: 'Manager 1',
                    role: 'MANAGER',
                    assigned_location_id: LOC_A,
                },
            ],
        } as any);

        const result = await scheduler.upsertShiftV2({
            userId: 'cashier-1',
            locationId: LOC_A,
            startAt: '2026-02-23T08:00:00.000Z',
            endAt: '2026-02-23T09:00:00.000Z',
            breakMinutes: 90,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Colación inválida');
    });

    it('evita solape de ausencias para el mismo colaborador', async () => {
        vi.mocked(query)
            .mockResolvedValueOnce({
                rows: [{ assigned_location_id: LOC_A }],
            } as any) // getTargetUserLocation
            .mockResolvedValueOnce({
                rows: [actorRow({ role: 'RRHH', name: 'RRHH 1' })],
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
        vi.mocked(query)
            .mockResolvedValueOnce({ rows: [actorRow()] } as any) // authorizeScheduler
            .mockResolvedValueOnce({
                rowCount: 3,
                rows: [],
            } as any); // update publish

        const result = await scheduler.publishScheduleV2(
            LOC_A,
            '2026-02-23'
        );

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.count).toBe(3);
    });

    it('getScheduleData incluye template_color en turnos', async () => {
        vi.mocked(query)
            .mockResolvedValueOnce({ rows: [actorRow()] } as any) // authorizeScheduler
            .mockResolvedValueOnce({
                rows: [{ id: 'shift-1', user_id: 'cashier-1', template_color: '#22c55e' }],
            } as any) // shifts
            .mockResolvedValueOnce({ rows: [] } as any) // templates
            .mockResolvedValueOnce({ rows: [] } as any); // timeoffs

        const result = await scheduler.getScheduleData(
            LOC_A,
            '2026-02-23',
            '2026-03-01'
        );

        expect(result.shifts).toHaveLength(1);
        expect(result.shifts[0]?.template_color).toBe('#22c55e');
    });

    it('rechaza crear plantilla global sin rol global', async () => {
        vi.mocked(query).mockResolvedValueOnce({
            rows: [actorRow()],
        } as any);

        const result = await scheduler.createShiftTemplate({
            name: 'Turno Global',
            start: '08:00',
            end: '16:00',
            color: '#22c55e',
            locationId: null,
            breakMinutes: 30,
            isRestDay: false,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Solo administradores globales');
    });

    it('rechaza ausencias globales desde actor local', async () => {
        vi.mocked(query)
            .mockResolvedValueOnce({ rows: [{ assigned_location_id: null }] } as any)
            .mockResolvedValueOnce({ rows: [actorRow()] } as any);

        const result = await scheduler.upsertTimeOffRequest({
            userId: 'cashier-1',
            type: 'VACATION',
            startDate: '2026-03-01',
            endDate: '2026-03-02',
            status: 'APPROVED',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Solo administradores globales');
    });

    it('rechaza editar turnos fuera del scope de la sucursal del actor', async () => {
        vi.mocked(query)
            .mockResolvedValueOnce({
                rows: [{ id: 'shift-1', user_id: 'cashier-1', location_id: LOC_B, start_at: '', end_at: '' }],
            } as any)
            .mockResolvedValueOnce({
                rows: [actorRow()],
            } as any);

        const result = await scheduler.upsertShiftV2({
            id: '550e8400-e29b-41d4-a716-446655440010',
            userId: 'cashier-1',
            locationId: LOC_B,
            startAt: '2026-02-23T08:00:00.000Z',
            endAt: '2026-02-23T16:00:00.000Z',
            breakMinutes: 30,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('sucursal');
    });

    it('rechaza asignar turnos a un colaborador fuera de la sucursal efectiva', async () => {
        vi.mocked(query)
            .mockResolvedValueOnce({ rows: [actorRow()] } as any)
            .mockResolvedValueOnce({
                rows: [{ id: 'cashier-2', assigned_location_id: LOC_B, is_active: true }],
            } as any);

        const result = await scheduler.upsertShiftV2({
            userId: 'cashier-2',
            locationId: LOC_A,
            startAt: '2026-02-23T08:00:00.000Z',
            endAt: '2026-02-23T16:00:00.000Z',
            breakMinutes: 30,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('no pertenece');
    });

    it('rechaza crear turnos solapados', async () => {
        vi.mocked(query)
            .mockResolvedValueOnce({ rows: [actorRow()] } as any)
            .mockResolvedValueOnce({
                rows: [{ id: 'cashier-1', assigned_location_id: LOC_A, is_active: true }],
            } as any)
            .mockResolvedValueOnce({
                rows: [{ id: 'existing-shift' }],
            } as any)
            .mockResolvedValueOnce({
                rows: [],
            } as any);

        const result = await scheduler.upsertShiftV2({
            userId: 'cashier-1',
            locationId: LOC_A,
            startAt: '2026-02-23T08:00:00.000Z',
            endAt: '2026-02-23T16:00:00.000Z',
            breakMinutes: 30,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('solapado');
    });
});
