export const APP_MODULES = [
    { id: 'POS', label: 'Punto de Venta (Caja)', category: 'OPERATIVO' },
    { id: 'INVENTORY', label: 'Inventario & Productos', category: 'OPERATIVO' },
    { id: 'WMS', label: 'Bodega & Logística', category: 'LOGISTICA' },
    { id: 'SUPPLY', label: 'Abastecimiento (Compras)', category: 'LOGISTICA' },
    { id: 'FINANCE', label: 'Finanzas & Caja', category: 'ADMIN' },
    { id: 'HR', label: 'Recursos Humanos', category: 'ADMIN' },
    { id: 'REPORTS', label: 'Reportes & BI', category: 'GERENCIA' },
    { id: 'SETTINGS', label: 'Configuración Global', category: 'GERENCIA' },
    { id: 'SECURITY', label: 'Seguridad & Usuarios', category: 'GERENCIA' },
];

export const ROLE_PRESETS: Record<string, string[]> = {
    'MANAGER': APP_MODULES.map(m => m.id), // Acceso Total
    'ADMIN': ['POS', 'INVENTORY', 'WMS', 'SUPPLY', 'REPORTS'],
    'QF': ['POS', 'INVENTORY', 'WMS', 'REPORTS'], // Químico Farmacéutico
    'CASHIER': ['POS'],
    'WAREHOUSE': ['INVENTORY', 'WMS'],
    'DRIVER': ['WMS'] // Solo ve despachos
};
