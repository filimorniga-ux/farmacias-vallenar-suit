export type WmsPendingDirection = 'INCOMING' | 'OUTGOING' | 'BOTH';
export type WmsPendingPriorityLevel = 'high' | 'medium' | 'low';

export interface WmsPendingPriorityInput {
    id: string;
    createdAt: number;
    direction: WmsPendingDirection;
    status?: string;
    itemCount?: number;
    totalQuantity?: number;
    now?: number;
}

export interface WmsPendingPriority {
    score: number;
    level: WmsPendingPriorityLevel;
    reasonLabel: string;
    evidenceLabel: string;
}

const HOURS = 60 * 60 * 1000;

const normalizeStatus = (status: string | undefined) => status?.trim().replace(/[\s-]+/g, '_').toUpperCase() || '';

const resolveAgeHours = (createdAt: number, now: number) => {
    if (!Number.isFinite(createdAt) || createdAt <= 0) return 0;
    return Math.max(0, Math.floor((now - createdAt) / HOURS));
};

export function getWmsPendingPriority(input: WmsPendingPriorityInput): WmsPendingPriority {
    const now = input.now ?? Date.now();
    const ageHours = resolveAgeHours(input.createdAt, now);
    const itemCount = Math.max(0, Math.floor(input.itemCount ?? 0));
    const totalQuantity = Math.max(0, Math.floor(input.totalQuantity ?? 0));
    const status = normalizeStatus(input.status);

    const ageScore = ageHours >= 72 ? 36 : ageHours >= 24 ? 24 : ageHours >= 8 ? 12 : 4;
    const directionScore = input.direction === 'INCOMING' ? 16 : input.direction === 'OUTGOING' ? 10 : 6;
    const statusScore = ['IN_TRANSIT', 'PENDING_RECEIPT', 'PARTIAL'].includes(status) ? 10 : 4;
    const volumeScore = totalQuantity >= 30 || itemCount >= 6 ? 6 : totalQuantity >= 10 || itemCount >= 3 ? 3 : 0;
    const score = ageScore + directionScore + statusScore + volumeScore;

    const level: WmsPendingPriorityLevel = score >= 55 ? 'high' : score >= 38 ? 'medium' : 'low';
    const reasonLabel = ageHours >= 72
        ? 'Más antiguo'
        : input.direction === 'INCOMING'
            ? 'Entrante pendiente'
            : input.direction === 'OUTGOING'
                ? 'Saliente pendiente'
                : 'Requiere revisión';
    const evidenceLabel = ageHours > 0
        ? `${ageHours} h pendiente · ${itemCount} SKU`
        : `Pendiente reciente · ${itemCount} SKU`;

    return {
        score,
        level,
        reasonLabel,
        evidenceLabel,
    };
}

export function compareWmsPendingPriority<T extends { id: string; created_at: number; priority: WmsPendingPriority }>(
    a: T,
    b: T,
): number {
    if (b.priority.score !== a.priority.score) return b.priority.score - a.priority.score;
    if (a.created_at !== b.created_at) return a.created_at - b.created_at;
    return a.id.localeCompare(b.id);
}
