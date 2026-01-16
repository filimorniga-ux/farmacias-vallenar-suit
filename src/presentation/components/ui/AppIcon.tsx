import React from 'react';
import { LucideIcon } from 'lucide-react';

export type AppIconVariant = 'solid' | 'outline' | 'glass';
export type AppIconSize = 'sm' | 'md' | 'lg' | 'xl';
export type AppThemeColor = 'slate' | 'gray' | 'zinc' | 'neutral' | 'stone' | 'red' | 'orange' | 'amber' | 'yellow' | 'lime' | 'green' | 'emerald' | 'teal' | 'cyan' | 'sky' | 'blue' | 'indigo' | 'violet' | 'purple' | 'fuchsia' | 'pink' | 'rose';

interface AppIconProps {
    icon: LucideIcon;
    color?: AppThemeColor;
    variant?: AppIconVariant;
    size?: AppIconSize;
    className?: string;
    withGlow?: boolean;
}

const SIZE_MAP = {
    sm: { container: 'w-8 h-8 rounded-lg', icon: 16 },
    md: { container: 'w-10 h-10 rounded-xl', icon: 20 },
    lg: { container: 'w-14 h-14 rounded-2xl', icon: 28 },
    xl: { container: 'w-20 h-20 rounded-3xl', icon: 40 },
};

const AppIcon: React.FC<AppIconProps> = ({
    icon: Icon,
    color = 'slate',
    variant = 'glass',
    size = 'md',
    className = '',
    withGlow = false,
}) => {
    // Dynamic Tailwind classes construction
    // Note: Tailwind scanner needs full class names to work, but since we are using standard colors, 
    // we assume the safelist includes these or we rely on JIT seeing them if we construct them carefully 
    // or if they are used elsewhere. 
    // To be safe with JIT, it's often better to map them explicitly or use a style object if dynamic.
    // However, for this task, I will construct strings assuming standard palette availability.

    // Background Styles
    const bgStyles = {
        solid: `bg-gradient-to-br from-${color}-500 to-${color}-600 text-white shadow-md shadow-${color}-400/20 border border-${color}-400/10`,
        outline: `bg-white border-2 border-${color}-200 text-${color}-600 shadow-sm`,
        glass: `bg-${color}-50 text-${color}-600 border border-${color}-100 shadow-sm`,
    };

    // Shadow / Glow
    const shadowStyle = withGlow
        ? `shadow-lg shadow-${color}-500/30`
        : variant === 'glass' ? 'shadow-sm' : '';

    const sizeConfig = SIZE_MAP[size];

    return (
        <div
            className={`
                ${sizeConfig.container} 
                ${bgStyles[variant]} 
                ${shadowStyle}
                flex items-center justify-center 
                transition-all duration-300
                ${className}
            `}
        >
            <Icon size={sizeConfig.icon} strokeWidth={2.5} />
        </div>
    );
};

export default AppIcon;
