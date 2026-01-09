export const APP_MODULES = [
    { id: 'POS', label: 'Punto de Venta (Caja)', category: 'OPERATIVO' },
    { id: 'CRM', label: 'Gestión de Clientes', category: 'OPERATIVO' },
    { id: 'INVENTORY', label: 'Inventario & Productos', category: 'OPERATIVO' },
    { id: 'WMS', label: 'Bodega & Logística', category: 'LOGISTICA' },
    { id: 'SUPPLY', label: 'Abastecimiento (Compras)', category: 'LOGISTICA' },
    { id: 'FINANCE', label: 'Finanzas & Caja', category: 'ADMIN' },
    { id: 'HR', label: 'Recursos Humanos', category: 'ADMIN' },
    { id: 'REPORTS', label: 'Reportes & BI', category: 'GERENCIA' },
    { id: 'SETTINGS', label: 'Configuración Global', category: 'GERENCIA' },
    { id: 'SECURITY', label: 'Seguridad & Usuarios', category: 'GERENCIA' },
];

// Definición Estricta de Roles V2
export const ROLE_PRESETS: Record<string, string[]> = {
    'MANAGER': ['POS', 'CRM', 'INVENTORY', 'WMS', 'SUPPLY', 'FINANCE', 'HR', 'REPORTS', 'SETTINGS', 'SECURITY'], // Acceso TOTAL
    'ADMIN': ['POS', 'CRM', 'INVENTORY', 'WMS', 'SUPPLY', 'FINANCE', 'REPORTS'], // TODO MENOS SETTINGS Y HR
    'QF': ['POS', 'CRM', 'INVENTORY', 'WMS', 'REPORTS'], // Mantener QF
    'CASHIER': ['POS', 'CRM'], // Solo POS y Clientes (WMS limitado por UI)
    'WAREHOUSE': ['INVENTORY', 'WMS', 'SUPPLY'], // Solo Inventario, WMS y Compras
    'DRIVER': ['WMS'],
    'GERENTE_GENERAL': ['POS', 'CRM', 'INVENTORY', 'WMS', 'SUPPLY', 'FINANCE', 'HR', 'REPORTS', 'SETTINGS', 'SECURITY'],
    'RRHH': ['HR', 'REPORTS'],
    'CONTADOR': ['FINANCE', 'REPORTS']
};
