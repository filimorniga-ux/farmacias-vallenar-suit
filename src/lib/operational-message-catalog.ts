export const OPERATIONAL_CONTEXT_STATUS_LABELS = {
    accepted: 'Contexto aceptado',
    rejected: 'Contexto no aplicado',
    ignored: 'Contexto ignorado',
} as const;

export const OPERATIONAL_CONTEXT_ORIGIN_LABELS = {
    validatedSession: 'Sesión validada',
    inheritedContext: 'Contexto heredado validado',
    manualSelection: 'Selección manual',
    inheritedFilters: 'Filtros heredados validados',
} as const;

export const OPERATIONAL_AUTHORITY_LABELS = {
    noUrlAuthority: 'URL sin autoridad',
    serverSourceOfTruth: 'Servidor como fuente de verdad',
    safePrefill: 'Prefill seguro',
} as const;

export const OPERATIONAL_REJECTION_REASON_LABELS = {
    outOfScope: 'Fuera de scope',
    inconsistent: 'Inconsistente',
    incomplete: 'Incompleto',
    invalid: 'Inválido',
} as const;

export const OPERATIONAL_VISIBLE_SEVERITY_LABELS = {
    info: 'info',
    warning: 'warning',
    critical: 'critical',
} as const;
