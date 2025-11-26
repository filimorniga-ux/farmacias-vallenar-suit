import { EmployeeProfile } from '../types';

export type Role = 'MANAGER' | 'ADMIN' | 'CASHIER' | 'WAREHOUSE' | 'QF';

export type Permission =
    | 'MANAGE_USERS'        // Create/Edit/Delete users, View Salaries
    | 'VIEW_HR'             // View HR module
    | 'MANAGE_INVENTORY'    // Create/Edit/Delete products
    | 'VIEW_INVENTORY'      // View stock
    | 'ADJUST_STOCK'        // WMS operations
    | 'PROCESS_SALE'        // POS access
    | 'VOID_SALE'           // Void transaction (Requires Override)
    | 'MANAGE_SHIFTS'       // Open/Close shifts, view cash flow
    | 'VIEW_REPORTS'        // BI Reports
    | 'MANAGE_SUPPLIERS';   // SRM

export const ROLES: Record<Role, string> = {
    MANAGER: 'Gerente General',
    ADMIN: 'Administrador',
    CASHIER: 'Cajero',
    WAREHOUSE: 'Bodeguero',
    QF: 'Químico Farmacéutico'
};

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
    MANAGER: [
        'MANAGE_USERS', 'VIEW_HR', 'MANAGE_INVENTORY', 'VIEW_INVENTORY',
        'ADJUST_STOCK', 'PROCESS_SALE', 'VOID_SALE', 'MANAGE_SHIFTS',
        'VIEW_REPORTS', 'MANAGE_SUPPLIERS'
    ],
    ADMIN: [
        'MANAGE_INVENTORY', 'VIEW_INVENTORY', 'ADJUST_STOCK', 'PROCESS_SALE',
        'VOID_SALE', 'MANAGE_SHIFTS', 'VIEW_REPORTS', 'MANAGE_SUPPLIERS'
    ],
    QF: [
        'MANAGE_INVENTORY', 'VIEW_INVENTORY', 'ADJUST_STOCK', 'PROCESS_SALE',
        'VOID_SALE', 'MANAGE_SHIFTS', 'VIEW_REPORTS', 'MANAGE_SUPPLIERS'
    ],
    CASHIER: [
        'PROCESS_SALE', 'VIEW_INVENTORY'
    ],
    WAREHOUSE: [
        'VIEW_INVENTORY', 'ADJUST_STOCK', 'MANAGE_SUPPLIERS'
    ]
};

export const hasPermission = (user: EmployeeProfile | null, permission: Permission): boolean => {
    if (!user) return false;

    // Check Role Permissions
    const rolePermissions = ROLE_PERMISSIONS[user.role as Role] || [];
    if (rolePermissions.includes(permission)) return true;

    // Check Custom Module Permissions (if any)
    if (user.allowed_modules?.includes(permission)) return true;

    return false;
};

export const canOverride = (user: EmployeeProfile): boolean => {
    return user.role === 'MANAGER' || user.role === 'ADMIN' || user.role === 'QF';
};
