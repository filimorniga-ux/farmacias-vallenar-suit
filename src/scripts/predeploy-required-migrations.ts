export const PREDEPLOY_REQUIRED_MIGRATIONS = [
    ['001', 'Bootstrap base schema'],
    ['002', 'Terminal integrity baseline'],
    ['003', 'UUID standardization'],
    ['004', 'Audit system'],
    ['005', 'Security pin hash'],
    ['006', 'Reconciliation module'],
    ['007', 'Accounts payable baseline'],
    ['019', 'Supabase RLS baseline policies'],
    ['022', 'Secure maintenance backup tables'],
    ['036', 'Fix Supabase advisor warnings'],
    ['037', 'Server-side auth session columns'],
    ['038', 'Notification reads scope fix'],
    ['039', 'Smart-invoice delete audit action'],
    ['040', 'Board notes baseline'],
    ['041', 'Supplier price intelligence RLS hardening'],
    ['042', 'Inventory WMS RLS hardening'],
    ['043', 'Monthly closing baseline'],
] as const;

export type PredeployRequiredMigration = typeof PREDEPLOY_REQUIRED_MIGRATIONS[number];
