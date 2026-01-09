'use client';

import { 
    Clock, CheckCircle, CheckCircle2, AlertTriangle, 
    XCircle, X, Loader, Link 
} from 'lucide-react';

// ============================================================================
// TIPOS
// ============================================================================

export type InvoiceStatus = 
    | 'PENDING' 
    | 'VALIDATED' 
    | 'MAPPING' 
    | 'PROCESSING' 
    | 'COMPLETED' 
    | 'PARTIAL' 
    | 'ERROR' 
    | 'REJECTED';

interface StatusConfig {
    label: string;
    bgColor: string;
    textColor: string;
    icon: React.ReactNode;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const STATUS_CONFIG: Record<InvoiceStatus, StatusConfig> = {
    PENDING: {
        label: 'Pendiente',
        bgColor: 'bg-yellow-100',
        textColor: 'text-yellow-800',
        icon: <Clock size={14} />,
    },
    VALIDATED: {
        label: 'Validado',
        bgColor: 'bg-blue-100',
        textColor: 'text-blue-800',
        icon: <CheckCircle size={14} />,
    },
    MAPPING: {
        label: 'Mapeando',
        bgColor: 'bg-indigo-100',
        textColor: 'text-indigo-800',
        icon: <Link size={14} />,
    },
    PROCESSING: {
        label: 'Procesando',
        bgColor: 'bg-gray-100',
        textColor: 'text-gray-800',
        icon: <Loader size={14} className="animate-spin" />,
    },
    COMPLETED: {
        label: 'Completado',
        bgColor: 'bg-green-100',
        textColor: 'text-green-800',
        icon: <CheckCircle2 size={14} />,
    },
    PARTIAL: {
        label: 'Parcial',
        bgColor: 'bg-orange-100',
        textColor: 'text-orange-800',
        icon: <AlertTriangle size={14} />,
    },
    ERROR: {
        label: 'Error',
        bgColor: 'bg-red-100',
        textColor: 'text-red-800',
        icon: <XCircle size={14} />,
    },
    REJECTED: {
        label: 'Rechazado',
        bgColor: 'bg-gray-100',
        textColor: 'text-gray-600',
        icon: <X size={14} />,
    },
};

// ============================================================================
// COMPONENTE
// ============================================================================

interface InvoiceStatusBadgeProps {
    status: InvoiceStatus | string;
    showIcon?: boolean;
    size?: 'sm' | 'md' | 'lg';
}

export default function InvoiceStatusBadge({ 
    status, 
    showIcon = true,
    size = 'md' 
}: InvoiceStatusBadgeProps) {
    const config = STATUS_CONFIG[status as InvoiceStatus] || STATUS_CONFIG.PENDING;
    
    const sizeClasses = {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-1 text-xs',
        lg: 'px-3 py-1.5 text-sm',
    };
    
    return (
        <span className={`
            inline-flex items-center gap-1.5 rounded-full font-medium
            ${config.bgColor} ${config.textColor} ${sizeClasses[size]}
        `}>
            {showIcon && config.icon}
            {config.label}
        </span>
    );
}
