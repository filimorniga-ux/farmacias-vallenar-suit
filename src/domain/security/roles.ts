import { EmployeeProfile } from '../types';

export type Role = 'GERENTE_GENERAL' | 'ADMIN' | 'MANAGER' | 'CASHIER' | 'WAREHOUSE_CHIEF' | 'WAREHOUSE' | 'QF' | 'RRHH' | 'CONTADOR' | 'DRIVER';

export type Permission =
    | 'GLOBAL_ACCESS'       // Super User Access
    | 'MANAGE_ROLES'        // Ability to change user roles (Gerente only)
    | 'MANAGE_USERS'        // Create/Edit/Delete users
    | 'VIEW_HR'             // View HR module
    | 'MANAGE_INVENTORY'    // Create/Edit/Delete products
    | 'VIEW_INVENTORY'      // View stock
    | 'ADJUST_STOCK'        // WMS operations
    | 'PROCESS_SALE'        // POS access
    | 'VOID_SALE'           // Void transaction
    | 'OVERRIDE_AUTH'       // Authorize restricted actions with PIN
    | 'MANAGE_SHIFTS'       // Open/Close shifts
    | 'VIEW_REPORTS'        // BI Reports
    | 'MANAGE_SUPPLIERS'    // SRM
    | 'PROCUREMENT_AI';     // Smart Invoice / Auto-Order

export const ROLES: Record<Role, string> = {
    GERENTE_GENERAL: 'Gerente General (Super Usuario)',
    ADMIN: 'Administrador de Sucursal',
    MANAGER: 'Gerente de Tienda (Legacy)', // Keeping for compatibility, alias to ADMIN or GERENTE depending on need
    CASHIER: 'Cajero',
    WAREHOUSE_CHIEF: 'Jefe de Bodega',
    WAREHOUSE: 'Bodeguero',
    QF: 'Químico Farmacéutico',
    RRHH: 'Recursos Humanos',
    CONTADOR: 'Contador',
    DRIVER: 'Conductor / Despacho'
};

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
    GERENTE_GENERAL: [
        'GLOBAL_ACCESS', 'MANAGE_ROLES', 'MANAGE_USERS', 'VIEW_HR',
        'MANAGE_INVENTORY', 'VIEW_INVENTORY', 'ADJUST_STOCK',
        'PROCESS_SALE', 'VOID_SALE', 'OVERRIDE_AUTH', 'MANAGE_SHIFTS',
        'VIEW_REPORTS', 'MANAGE_SUPPLIERS', 'PROCUREMENT_AI'
    ],
    // Admin has almost full access but cannot MANAGE_ROLES (Global Access removed to enforce granular checks if needed, but keeping broad permissions)
    ADMIN: [
        'MANAGE_USERS', 'VIEW_HR', 'MANAGE_INVENTORY', 'VIEW_INVENTORY',
        'ADJUST_STOCK', 'PROCESS_SALE', 'VOID_SALE', 'OVERRIDE_AUTH',
        'MANAGE_SHIFTS', 'VIEW_REPORTS', 'MANAGE_SUPPLIERS', 'PROCUREMENT_AI'
    ],
    // Manager kept as alias to Admin for now to prevent breaking legacy code
    MANAGER: [
        'MANAGE_USERS', 'VIEW_HR', 'MANAGE_INVENTORY', 'VIEW_INVENTORY',
        'ADJUST_STOCK', 'PROCESS_SALE', 'VOID_SALE', 'OVERRIDE_AUTH',
        'MANAGE_SHIFTS', 'VIEW_REPORTS', 'MANAGE_SUPPLIERS', 'PROCUREMENT_AI'
    ],
    QF: [
        'MANAGE_INVENTORY', 'VIEW_INVENTORY', 'ADJUST_STOCK',
        'PROCESS_SALE', 'VOID_SALE', 'OVERRIDE_AUTH', 'MANAGE_SHIFTS',
        'VIEW_REPORTS', 'MANAGE_SUPPLIERS', 'PROCUREMENT_AI'
    ],
    WAREHOUSE_CHIEF: [
        'MANAGE_INVENTORY', // Can Create/Edit/Delete products
        'VIEW_INVENTORY', 'ADJUST_STOCK', 'MANAGE_SUPPLIERS', 'PROCUREMENT_AI'
    ],
    WAREHOUSE: [
        'VIEW_INVENTORY', 'ADJUST_STOCK', 'PROCUREMENT_AI'
        // NO MANAGE_INVENTORY (Cannot edit/delete products)
    ],
    CASHIER: [
        'PROCESS_SALE', 'VIEW_INVENTORY', 'ADJUST_STOCK' // Added WMS access as requested
    ],
    RRHH: ['MANAGE_USERS', 'VIEW_HR', 'MANAGE_SHIFTS', 'VIEW_REPORTS'],
    CONTADOR: ['VIEW_REPORTS', 'MANAGE_SHIFTS'],
    DRIVER: ['VIEW_INVENTORY']
};

export const hasPermission = (user: EmployeeProfile | null, permission: Permission): boolean => {
    if (!user) return false;

    // Gerente General Override
    if (user.role === 'GERENTE_GENERAL') return true;

    // Check Role Permissions
    const rolePermissions = ROLE_PERMISSIONS[user.role as Role] || [];
    if (rolePermissions.includes(permission)) return true;

    // Check Custom Module Permissions
    if (user.allowed_modules?.includes(permission)) return true;

    return false;
};

export const canOverride = (user: EmployeeProfile): boolean => {
    // Gerente and Admin (and QF/Managers) can override
    // Bodegueros/Cajeros cannot.
    return ['GERENTE_GENERAL', 'ADMIN', 'MANAGER', 'QF'].includes(user.role);
};

export const canManageRoles = (user: EmployeeProfile): boolean => {
    return user.role === 'GERENTE_GENERAL';
};
