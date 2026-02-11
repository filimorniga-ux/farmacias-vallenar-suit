/**
 * WMSBottomTabBar — Barra de navegación inferior estilo nativo (iOS/Android)
 * 
 * Glassmorphism, safe area bottom, haptic feedback, touch targets 48px.
 * Solo se muestra en móvil (usePlatform).
 * 
 * Skills: estilo-marca (#0ea5e9), modo-produccion (touch targets)
 */
import React from 'react';
import { Truck, PackageCheck, ArrowLeftRight, PackagePlus } from 'lucide-react';

type WMSTab = 'despacho' | 'recepcion' | 'transferencia' | 'pedidos';

interface WMSBottomTabBarProps {
    activeTab: WMSTab;
    onTabChange: (tab: WMSTab) => void;
}

const TABS: { key: WMSTab; label: string; icon: typeof Truck; color: string; activeColor: string }[] = [
    { key: 'despacho', label: 'Despacho', icon: Truck, color: 'text-slate-400', activeColor: 'text-sky-500' },
    { key: 'recepcion', label: 'Recepción', icon: PackageCheck, color: 'text-slate-400', activeColor: 'text-emerald-500' },
    { key: 'transferencia', label: 'Transfer.', icon: ArrowLeftRight, color: 'text-slate-400', activeColor: 'text-purple-500' },
    { key: 'pedidos', label: 'Pedidos', icon: PackagePlus, color: 'text-slate-400', activeColor: 'text-amber-500' },
];

const DOT_COLORS: Record<WMSTab, string> = {
    despacho: 'bg-sky-500',
    recepcion: 'bg-emerald-500',
    transferencia: 'bg-purple-500',
    pedidos: 'bg-amber-500',
};

export const WMSBottomTabBar: React.FC<WMSBottomTabBarProps> = ({ activeTab, onTabChange }) => {

    const handleTabPress = (tab: WMSTab) => {
        // Haptic feedback en dispositivos que lo soporten
        if ('vibrate' in navigator) {
            navigator.vibrate(10);
        }
        onTabChange(tab);
    };

    return (
        <div className="fixed bottom-[68px] left-0 right-0 z-[51] no-select lg:hidden">
            {/* Glassmorphism bar */}
            <div className="bg-white/80 backdrop-blur-xl border-t border-slate-200/60
                          shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
                <div className="flex items-stretch justify-around px-1">
                    {TABS.map(tab => {
                        const isActive = activeTab === tab.key;
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => handleTabPress(tab.key)}
                                className={`flex-1 flex flex-col items-center justify-center gap-0.5 
                                          py-2 min-h-[52px] relative
                                          transition-all duration-200 active:scale-95
                                          ${isActive ? '' : 'opacity-60'}`}
                                aria-label={tab.label}
                                aria-current={isActive ? 'page' : undefined}
                            >
                                {/* Active dot indicator */}
                                {isActive && (
                                    <div className={`absolute top-0.5 left-1/2 -translate-x-1/2 
                                                   w-5 h-0.5 rounded-full ${DOT_COLORS[tab.key]}
                                                   animate-in fade-in zoom-in-50 duration-200`} />
                                )}

                                <Icon
                                    size={22}
                                    className={`transition-colors duration-200 
                                              ${isActive ? tab.activeColor : tab.color}`}
                                    strokeWidth={isActive ? 2.5 : 2}
                                />
                                <span className={`text-[10px] font-semibold leading-tight
                                               transition-colors duration-200
                                               ${isActive ? tab.activeColor : 'text-slate-400'}`}>
                                    {tab.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default WMSBottomTabBar;
