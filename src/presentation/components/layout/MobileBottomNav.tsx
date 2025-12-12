import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Package, Menu } from 'lucide-react';
import { motion } from 'framer-motion';

interface MobileBottomNavProps {
    onMenuClick: () => void;
}

export default function MobileBottomNav({ onMenuClick }: MobileBottomNavProps) {
    const location = useLocation();

    const tabs = [
        { icon: LayoutDashboard, label: 'Inicio', path: '/dashboard', color: 'text-indigo-600' },
        { icon: ShoppingCart, label: 'Caja', path: '/pos', color: 'text-emerald-600' },
        { icon: Package, label: 'Inv.', path: '/inventory', color: 'text-cyan-600' },
    ];

    return (
        <div className="lg:hidden fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 px-6 py-2 pb-safe z-50 flex justify-between items-center shadow-lg">
            {tabs.map((tab) => {
                const isActive = location.pathname === tab.path;
                return (
                    <Link
                        key={tab.path}
                        to={tab.path}
                        className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-16 ${isActive ? 'bg-slate-50' : ''}`}
                    >
                        <tab.icon
                            size={24}
                            className={`${isActive ? tab.color : 'text-slate-400'}`}
                            strokeWidth={isActive ? 2.5 : 2}
                        />
                        <span className={`text-[10px] font-bold ${isActive ? 'text-slate-800' : 'text-slate-400'}`}>
                            {tab.label}
                        </span>
                        {isActive && (
                            <motion.div
                                layoutId="bottom-nav-pill"
                                className="absolute -top-2 w-8 h-1 bg-slate-800 rounded-b-lg"
                            />
                        )}
                    </Link>
                );
            })}

            {/* More / Menu Button */}
            <button
                onClick={onMenuClick}
                className="flex flex-col items-center gap-1 p-2 rounded-xl w-16 active:scale-95 transition-transform"
            >
                <div className="bg-slate-100 p-1 rounded-lg">
                    <Menu size={20} className="text-slate-600" />
                </div>
                <span className="text-[10px] font-bold text-slate-500">
                    Más
                </span>
            </button>
        </div>
    );
}
