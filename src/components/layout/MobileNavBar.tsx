
import { Home, Scan, ShoppingCart, Menu, Box } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function MobileNavBar() {
    const pathname = usePathname();

    const isActive = (path: string) => pathname === path || pathname?.startsWith(path + '/');

    const navItems = [
        { href: '/dashboard', label: 'Inicio', icon: Home },
        { href: '/pos', label: 'Acceder', icon: ShoppingCart },
        { href: '/inventory', label: 'Stock', icon: Box },
        { href: '/settings', label: 'Menú', icon: Menu },
    ];

    return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 h-16 flex items-center justify-around pb-safe">
            {navItems.map((item) => {
                const active = isActive(item.href);
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`flex flex-col items-center justify-center w-full h-full ${active ? 'text-blue-600' : 'text-gray-500'}`}
                    >
                        <item.icon size={24} strokeWidth={active ? 2.5 : 2} />
                        <span className="text-[10px] mt-1 font-medium">{item.label}</span>
                    </Link>
                );
            })}
        </div>
    );
}
