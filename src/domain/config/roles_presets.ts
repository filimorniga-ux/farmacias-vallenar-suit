export const APP_MODULES = [
    // Operativo
    { id: 'POS', label: 'Punto de Venta (Caja)', category: 'OPERATIVO' },
    { id: 'CRM', label: 'Gestión de Clientes', category: 'OPERATIVO' },
    { id: 'INVENTORY', label: 'Inventario & Productos', category: 'OPERATIVO' },
    { id: 'WMS', label: 'Operaciones WMS (Bodega)', category: 'OPERATIVO' },

    // Logística & Abastecimiento
    { id: 'SUPPLIERS', label: 'Gestión de Proveedores', category: 'LOGISTICA' },
    { id: 'PROCUREMENT', label: 'Abastecimiento (IA)', category: 'LOGISTICA' },
    { id: 'SUGGESTED_ORDER', label: 'Pedido Sugerido (IA)', category: 'LOGISTICA' },

    // Administración
    { id: 'FINANCE', label: 'Finanzas & Caja', category: 'ADMIN' }, // Legacy/General
    { id: 'TREASURY', label: 'Tesorería', category: 'ADMIN' },
    { id: 'MONTHLY_CLOSING', label: 'Cierre Mensual', category: 'ADMIN' },
    { id: 'HR', label: 'Recursos Humanos', category: 'ADMIN' },
    { id: 'SCHEDULING', label: 'Gestor Horario', category: 'ADMIN' },

    // Gerencia & Estrategia
    { id: 'DASHBOARD', label: 'Resumen General', category: 'GERENCIA' },
    { id: 'REPORTS', label: 'Reportes & BI', category: 'GERENCIA' },
    { id: 'NETWORK', label: 'Gestión de Red', category: 'GERENCIA' },
    { id: 'BOARD', label: 'Pizarra (Comunicaciones)', category: 'GERENCIA' },
    { id: 'SETTINGS', label: 'Configuración Global', category: 'GERENCIA' },
];

// Definición Estricta de Roles V2
export const ROLE_PRESETS: Record<string, string[]> = {
    'MANAGER': [
        'DASHBOARD', 'POS', 'CRM', 'INVENTORY', 'WMS', 'SUPPLIERS',
        'PROCUREMENT', 'SUGGESTED_ORDER', 'REPORTS', 'HR', 'SCHEDULING',
        'NETWORK', 'TREASURY', 'MONTHLY_CLOSING', 'SETTINGS', 'BOARD'
    ],
    'ADMIN': [
        'DASHBOARD', 'POS', 'CRM', 'INVENTORY', 'WMS', 'SUPPLIERS',
        'PROCUREMENT', 'SUGGESTED_ORDER', 'REPORTS', 'HR', 'SCHEDULING',
        'NETWORK', 'TREASURY', 'MONTHLY_CLOSING', 'SETTINGS', 'BOARD'
    ],
    'GERENTE_GENERAL': [
        'DASHBOARD', 'POS', 'CRM', 'INVENTORY', 'WMS', 'SUPPLIERS',
        'PROCUREMENT', 'SUGGESTED_ORDER', 'REPORTS', 'HR', 'SCHEDULING',
        'NETWORK', 'TREASURY', 'MONTHLY_CLOSING', 'SETTINGS', 'BOARD'
    ],
    'QF': ['POS', 'CRM', 'INVENTORY', 'WMS', 'REPORTS', 'SUPPLIERS', 'SUGGESTED_ORDER', 'BOARD'],
    'CASHIER': ['POS', 'CRM', 'WMS', 'BOARD'],
    'WAREHOUSE': ['INVENTORY', 'WMS', 'SUPPLIERS', 'PROCUREMENT', 'SUGGESTED_ORDER', 'BOARD'],
    'RRHH': ['HR', 'SCHEDULING', 'BOARD'],
    'CONTADOR': ['TREASURY', 'MONTHLY_CLOSING', 'REPORTS', 'BOARD']
};
