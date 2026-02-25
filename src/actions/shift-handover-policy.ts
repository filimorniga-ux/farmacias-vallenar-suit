const SUPERVISOR_OVERRIDE_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'] as const;

interface HandoverAuthorizationInput {
    shiftOwnerUserId?: string | null;
    actorUserId: string;
    supervisorRole?: string | null;
}

/**
 * Define si un cierre de turno puede continuar cuando el actor no es el dueño de la sesión.
 * - Mismo usuario del turno: permitido.
 * - Usuario distinto: solo permitido con rol supervisor válido.
 */
export function canAuthorizeShiftClosure(input: HandoverAuthorizationInput): boolean {
    const owner = input.shiftOwnerUserId || null;
    const actor = input.actorUserId;
    const role = String(input.supervisorRole || '').toUpperCase();

    if (!owner) return true;
    if (owner === actor) return true;

    return SUPERVISOR_OVERRIDE_ROLES.includes(role as (typeof SUPERVISOR_OVERRIDE_ROLES)[number]);
}
