'use client';

import { useState } from 'react';
import { Search, MapPin, Clock, Phone, Mail, LogIn, Pill, CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import { searchPublicProductsSecure } from '@/actions/public-search-v2';
import { cn } from '@/lib/utils';

type PublicProduct = {
    id: string;
    name: string;
    dci: string | null;
    status: 'Disponible' | 'Agotado';
};

export default function WebPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState<PublicProduct[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        const query = searchTerm.trim();
        if (query.length < 3) return;

        setIsSearching(true);
        setHasSearched(true);
        try {
            const response = await searchPublicProductsSecure(query);
            setResults(response.success && response.data ? response.data : []);
        } catch (error) {
            console.error('Search failed', error);
            setResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    return (
        <div className="min-h-dvh flex flex-col bg-white">
            {/* Navbar */}
            <nav className="bg-white border-b border-gray-100 sticky top-0 z-50 pt-safe">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-16 py-3 flex justify-between items-center gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <div className="bg-blue-600 p-2 rounded-lg">
                            <Pill className="text-white" size={24} />
                        </div>
                        <span className="text-lg sm:text-xl font-bold text-blue-900 truncate">Farmacias Vallenar</span>
                    </div>
                    <Link
                        href="/"
                        className="min-h-11 inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                        <LogIn size={18} />
                        <span className="text-right leading-tight">Acceso Interno</span>
                    </Link>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative bg-blue-900 text-white py-16 sm:py-20 lg:py-32 overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.28),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.18),transparent_30%)]" />
                <img
                    src="/assets/logo_vallenar.png"
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 top-1/2 h-56 w-auto -translate-x-1/2 -translate-y-1/2 opacity-[0.06] sm:h-80"
                />
                <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <h1 className="text-4xl md:text-6xl font-bold mb-6 tracking-tight text-balance">
                        Salud y Confianza <span className="text-blue-400">Local</span>
                    </h1>
                    <p className="text-lg sm:text-xl text-blue-100 mb-10 sm:mb-12 max-w-2xl mx-auto text-balance">
                        Tu farmacia de barrio, ahora más cerca de ti. Consulta la disponibilidad de tus medicamentos en tiempo real.
                    </p>

                    {/* Search Box */}
                    <div className="max-w-2xl mx-auto bg-white p-2 rounded-2xl shadow-2xl">
                        <form onSubmit={handleSearch} className="flex flex-col gap-2 sm:flex-row">
                            <div className="relative min-w-0 flex-1">
                                <label htmlFor="public-product-search" className="sr-only">Buscar medicamento</label>
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={24} />
                                <input
                                    id="public-product-search"
                                    type="text"
                                    inputMode="search"
                                    autoComplete="off"
                                    aria-label="Buscar medicamento"
                                    placeholder="Buscar medicamento..."
                                    className="w-full min-h-12 pl-12 pr-4 py-3 sm:py-4 text-base sm:text-lg text-gray-900 placeholder-gray-400 bg-transparent border-none focus:ring-0 focus:outline-none"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isSearching || searchTerm.trim().length < 3}
                                className="min-h-12 w-full sm:w-auto px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSearching ? 'Buscando...' : 'Buscar'}
                            </button>
                        </form>
                    </div>
                </div>
            </section>

            {/* Results Section */}
            <section className="flex-1 bg-gray-50 py-12">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    {hasSearched && (
                        <div className="space-y-4">
                            <h2 className="text-lg font-semibold text-gray-700 mb-4">
                                Resultados de búsqueda
                            </h2>

                            {results.length > 0 ? (
                                <div className="grid gap-4">
                                    {results.map((product) => (
                                        <div key={product.id} className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center hover:shadow-md transition-shadow">
                                            <div className="min-w-0">
                                                <h3 className="text-lg font-bold text-gray-900">{product.name}</h3>
                                                {product.dci && (
                                                    <p className="text-sm text-gray-500">Principio Activo: {product.dci}</p>
                                                )}
                                            </div>
                                            <div className={cn(
                                                "shrink-0 flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-bold",
                                                product.status === 'Disponible'
                                                    ? "bg-green-100 text-green-700"
                                                    : "bg-red-100 text-red-700"
                                            )}>
                                                {product.status === 'Disponible' ? (
                                                    <>
                                                        <CheckCircle size={18} />
                                                        Disponible
                                                    </>
                                                ) : (
                                                    <>
                                                        <XCircle size={18} />
                                                        Agotado
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
                                    <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Search className="text-gray-400" size={32} />
                                    </div>
                                    <h3 className="text-lg font-medium text-gray-900">No encontramos resultados</h3>
                                    <p className="text-gray-500">Intenta con otro nombre o revisa la ortografía.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {!hasSearched && (
                        <div className="grid md:grid-cols-3 gap-8 text-center">
                            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                                <div className="bg-blue-100 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 text-blue-600">
                                    <MapPin size={24} />
                                </div>
                                <h3 className="font-bold text-gray-900 mb-2">Ubicación Central</h3>
                                <p className="text-gray-600 text-sm">
                                    Arturo Prat 1234<br />
                                    Vallenar, Atacama
                                </p>
                            </div>
                            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                                <div className="bg-green-100 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 text-green-600">
                                    <Clock size={24} />
                                </div>
                                <h3 className="font-bold text-gray-900 mb-2">Horario Continuado</h3>
                                <p className="text-gray-600 text-sm">
                                    Lunes a Viernes<br />
                                    09:00 - 20:00 hrs
                                </p>
                            </div>
                            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
                                <div className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                                    URGENCIA
                                </div>
                                <div className="bg-purple-100 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 text-purple-600">
                                    <Phone size={24} />
                                </div>
                                <h3 className="font-bold text-gray-900 mb-2">Farmacia de Turno</h3>
                                <p className="text-gray-600 text-sm">
                                    Consulta disponibilidad<br />
                                    +56 51 261 2345
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-gray-900 text-gray-400 py-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid md:grid-cols-4 gap-8 mb-8">
                        <div className="col-span-2">
                            <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
                                <Pill className="text-blue-500" />
                                Farmacias Vallenar
                            </h2>
                            <p className="text-sm leading-relaxed max-w-xs">
                                Comprometidos con la salud de nuestra comunidad desde 1990.
                                Calidad, confianza y los mejores precios garantizados.
                            </p>
                        </div>
                        <div>
                            <h3 className="text-white font-bold mb-4">Enlaces</h3>
                            <ul className="space-y-2 text-sm">
                                <li><Link href="/web" className="min-h-11 min-w-11 inline-flex items-center hover:text-white transition-colors">Inicio</Link></li>
                                <li><Link href="/select-context" className="min-h-11 min-w-11 inline-flex items-center hover:text-white transition-colors">Seleccionar sucursal</Link></li>
                                <li><Link href="/legal" className="min-h-11 min-w-11 inline-flex items-center hover:text-white transition-colors">Marco legal</Link></li>
                                <li><Link href="/" className="min-h-11 min-w-11 inline-flex items-center hover:text-white transition-colors">Acceso Interno</Link></li>
                            </ul>
                        </div>
                        <div>
                            <h3 className="text-white font-bold mb-4">Contacto</h3>
                            <div className="flex gap-3">
                                <a href="tel:+56512612345" aria-label="Llamar a Farmacias Vallenar" className="min-h-11 min-w-11 inline-flex items-center justify-center bg-gray-800 p-2 rounded-lg hover:bg-blue-600 hover:text-white transition-all">
                                    <Phone size={20} />
                                </a>
                                <a href="mailto:soporte@farmaciasvallenar.cl" aria-label="Enviar correo a Farmacias Vallenar" className="min-h-11 min-w-11 inline-flex items-center justify-center bg-gray-800 p-2 rounded-lg hover:bg-cyan-600 hover:text-white transition-all">
                                    <Mail size={20} />
                                </a>
                            </div>
                        </div>
                    </div>
                    <div className="border-t border-gray-800 pt-8 text-sm text-center">
                        &copy; {new Date().getFullYear()} Farmacias Vallenar. Todos los derechos reservados.
                    </div>
                </div>
            </footer>
        </div>
    );
}
