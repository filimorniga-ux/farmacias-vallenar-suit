'use client';

import { Sparkles, AlertTriangle, CheckCircle } from 'lucide-react';

// ============================================================================
// TIPOS
// ============================================================================

interface AIConfidenceIndicatorProps {
    score: number | null; // 0.0 - 1.0
    showLabel?: boolean;
    showPercentage?: boolean;
    size?: 'sm' | 'md' | 'lg';
}

// ============================================================================
// COMPONENTE
// ============================================================================

export default function AIConfidenceIndicator({
    score,
    showLabel = true,
    showPercentage = true,
    size = 'md',
}: AIConfidenceIndicatorProps) {
    if (score === null || score === undefined) {
        return (
            <span className="text-gray-400 text-sm flex items-center gap-1">
                <Sparkles size={14} />
                N/A
            </span>
        );
    }
    
    const percentage = Math.round(score * 100);
    
    // Determinar nivel de confianza
    const getLevel = () => {
        if (percentage >= 90) return { label: 'Alta', color: 'text-green-600', bg: 'bg-green-500', icon: CheckCircle };
        if (percentage >= 70) return { label: 'Media', color: 'text-yellow-600', bg: 'bg-yellow-500', icon: Sparkles };
        return { label: 'Baja', color: 'text-red-600', bg: 'bg-red-500', icon: AlertTriangle };
    };
    
    const level = getLevel();
    const Icon = level.icon;
    
    const sizeConfig = {
        sm: { iconSize: 12, text: 'text-xs', bar: 'h-1', width: 'w-12' },
        md: { iconSize: 14, text: 'text-sm', bar: 'h-1.5', width: 'w-16' },
        lg: { iconSize: 16, text: 'text-base', bar: 'h-2', width: 'w-20' },
    };
    
    const config = sizeConfig[size];
    
    return (
        <div className="flex items-center gap-2">
            <Icon size={config.iconSize} className={level.color} />
            
            {/* Progress bar */}
            <div className={`${config.width} ${config.bar} bg-gray-200 rounded-full overflow-hidden`}>
                <div 
                    className={`h-full ${level.bg} transition-all duration-300`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
            
            {showPercentage && (
                <span className={`${config.text} font-medium ${level.color}`}>
                    {percentage}%
                </span>
            )}
            
            {showLabel && (
                <span className={`${config.text} text-gray-500`}>
                    ({level.label})
                </span>
            )}
        </div>
    );
}
