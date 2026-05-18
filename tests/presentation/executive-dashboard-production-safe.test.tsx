/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import type { ExecutiveMetrics } from '@/actions/dashboard-v2';

const {
    mockGetExecutiveDashboardMetricsSecure,
    mockGetValidatedSession,
    mockRedirect,
} = vi.hoisted(() => ({
    mockGetExecutiveDashboardMetricsSecure: vi.fn(),
    mockGetValidatedSession: vi.fn(),
    mockRedirect: vi.fn((path: string) => {
        throw new Error(`NEXT_REDIRECT:${path}`);
    }),
}));

vi.mock('next/navigation', () => ({
    redirect: (path: string) => mockRedirect(path),
}));

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: () => mockGetValidatedSession(),
}));

vi.mock('@/actions/admin-scope', () => ({
    ANALYTICS_PAGE_ROLES: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
}));

vi.mock('@/actions/dashboard-v2', () => ({
    getExecutiveDashboardMetricsSecure: mockGetExecutiveDashboardMetricsSecure,
}));

import ExecutiveDashboard from '@/presentation/components/analytics/ExecutiveDashboard';
import ManagerDashboardPage from '@/app/analytics/manager-dashboard/page';

const buildMetrics = (grossProfit: ExecutiveMetrics['grossProfit']): ExecutiveMetrics => ({
    revenue: {
        current: 100000,
        previous: 80000,
        growth: 25,
    },
    aov: {
        current: 10000,
        previous: 10000,
        growth: 0,
    },
    grossProfit,
    salesByLocation: [
        { name: 'Sucursal Centro', total: 100000 },
    ],
    recentSales: [
        {
            id: 'sale-1',
            amount: 10000,
            timestamp: '2026-04-21T12:00:00.000Z',
            location: 'Sucursal Centro',
        },
    ],
});

const unavailableGrossProfit: ExecutiveMetrics['grossProfit'] = {
    value: null,
    margin: null,
    confidence: 'unavailable',
    reason: 'Costos unitarios incompletos; margen bruto no mostrado como KPI ejecutivo final',
    costCoverage: {
        costedLines: 0,
        totalLines: 2,
        complete: false,
    },
};

const productionSafeGrossProfit: ExecutiveMetrics['grossProfit'] = {
    value: 30000,
    margin: 30,
    confidence: 'production-safe',
    reason: 'Costos unitarios completos en líneas vendidas',
    costCoverage: {
        costedLines: 2,
        totalLines: 2,
        complete: true,
    },
};

describe('Executive dashboard production-safe metrics', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('no muestra margen bruto inventado cuando el contrato lo marca como no disponible', async () => {
        mockGetExecutiveDashboardMetricsSecure.mockResolvedValue({
            success: true,
            data: buildMetrics(unavailableGrossProfit),
        });

        render(<ExecutiveDashboard />);

        expect(await screen.findByText('No disponible')).toBeTruthy();
        expect(screen.getByText('No final')).toBeTruthy();
        expect(screen.getByText(/Costos unitarios incompletos/i)).toBeTruthy();
        expect(screen.queryByText('30.0%')).toBeNull();
    });

    it('muestra margen bruto solo cuando la métrica es production-safe', async () => {
        mockGetExecutiveDashboardMetricsSecure.mockResolvedValue({
            success: true,
            data: buildMetrics(productionSafeGrossProfit),
        });

        render(<ExecutiveDashboard />);

        expect(await screen.findByText('30.0%')).toBeTruthy();
        expect(screen.getByText(/Utilidad:/i)).toBeTruthy();
        expect(screen.queryByText('No final')).toBeNull();
    });

    it('no presenta las ventas recientes como tiempo real cuando solo carga datos al abrir', async () => {
        mockGetExecutiveDashboardMetricsSecure.mockResolvedValue({
            success: true,
            data: buildMetrics(productionSafeGrossProfit),
        });

        render(<ExecutiveDashboard />);

        expect(await screen.findByText('Últimas ventas')).toBeTruthy();
        expect(screen.getByText('Datos cargados al abrir')).toBeTruthy();
        expect(screen.queryByText(/Tiempo Real/i)).toBeNull();
        expect(mockGetExecutiveDashboardMetricsSecure).toHaveBeenCalledTimes(1);
    });

    it('mantiene la ruta ejecutiva sin fallback silencioso de margen', async () => {
        mockGetValidatedSession.mockResolvedValue({
            userId: 'manager-1',
            role: 'MANAGER',
            locationId: 'loc-1',
            userName: 'Manager',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        mockGetExecutiveDashboardMetricsSecure.mockResolvedValue({
            success: true,
            data: buildMetrics(unavailableGrossProfit),
        });

        const page = await ManagerDashboardPage();
        render(page as ReactElement);

        expect(screen.getByText('Dashboard Ejecutivo')).toBeTruthy();
        expect(await screen.findByText('No disponible')).toBeTruthy();
        expect(screen.getByText('No final')).toBeTruthy();
        expect(screen.getByText(/Costos unitarios incompletos/i)).toBeTruthy();
        expect(screen.queryByText('30.0%')).toBeNull();
        expect(screen.queryByRole('button', { name: /Filtrar/i })).toBeNull();
        expect(screen.queryByRole('button', { name: /Reporte PDF/i })).toBeNull();
        expect(mockGetExecutiveDashboardMetricsSecure).toHaveBeenCalledTimes(1);
    });
});
