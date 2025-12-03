import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Package, Menu } from 'lucide-react';

interface BottomNavigationProps {
    onMenuClick: () => void;
}

const BottomNavigation: React.FC<BottomNavigationProps> = ({ onMenuClick }) => {
    const location = useLocation();

    const navItems = [
        { icon: LayoutDashboard, label: 'Inicio', path: '/dashboard' },
        { icon: ShoppingCart, label: 'Venta', path: '/pos' },
        { icon: Package, label: 'Stock', path: '/inventory' },
    ];

    return (
        <div className="fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-30 md:hidden pb-safe">
            <div className="flex justify-around items-center h-16">
                {navItems.map((item) => (
                    <Link
                        key={item.path}
                        to={item.path}
                        className={`flex flex-col items-center justify-center w-full h-full transition-colors ${location.pathname === item.path
                            ? 'text-cyan-600'
                            : 'text-slate-400 hover:text-slate-600'
                            }`}
                    >
                        <item.icon size={24} strokeWidth={location.pathname === item.path ? 2.5 : 2} />
                        <span className="text-[10px] font-medium mt-1">{item.label}</span>
                    </Link>
                ))}
                <button
                    onClick={onMenuClick}
                    className="flex flex-col items-center justify-center w-full h-full text-slate-400 hover:text-slate-600 transition-colors"
                >
                    <Menu size={24} />
                    <span className="text-[10px] font-medium mt-1">Menú</span>
                </button>
            </div>
        </div>
    );
};

export default BottomNavigation;
