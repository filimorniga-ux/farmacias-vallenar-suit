'use client';

import { useState } from 'react';
import { Search, MapPin, Clock, Phone, Facebook, Instagram, LogIn, Pill, CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import { searchPublicProducts, PublicProduct } from '@/actions/public-search';
import { cn } from '@/lib/utils';

export default function WebPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState<PublicProduct[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (searchTerm.length < 3) return;

        setIsSearching(true);
        setHasSearched(true);
        try {
            const products = await searchPublicProducts(searchTerm);
            setResults(products);
        } catch (error) {
            console.error('Search failed', error);
            setResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-white">
            {/* Navbar */}
            <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <div className="bg-blue-600 p-2 rounded-lg">
                            <Pill className="text-white" size={24} />
                        </div>
                        <span className="text-xl font-bold text-blue-900">Farmacias Vallenar</span>
                    </div>
                    <Link
                        href="/login"
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                        <LogIn size={18} />
                        Acceso Funcionarios
                    </Link>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative bg-blue-900 text-white py-20 lg:py-32 overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1631549916768-4119b2e5f926?q=80&w=2979&auto=format&fit=crop')] bg-cover bg-center opacity-10"></div>
                <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <h1 className="text-4xl md:text-6xl font-bold mb-6 tracking-tight">
                        Salud y Confianza <span className="text-blue-400">Local</span>
                    </h1>
                    <p className="text-xl text-blue-100 mb-12 max-w-2xl mx-auto">
                        Tu farmacia de barrio, ahora más cerca de ti. Consulta la disponibilidad de tus medicamentos en tiempo real.
                    </p>

                    {/* Search Box */}
                    <div className="max-w-2xl mx-auto bg-white p-2 rounded-2xl shadow-2xl transform hover:scale-[1.01] transition-transform duration-300">
                        <form onSubmit={handleSearch} className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={24} />
                                <input
                                    type="text"
                                    placeholder="¿Qué medicamento buscas? (Ej: Paracetamol)"
                                    className="w-full pl-12 pr-4 py-4 text-lg text-gray-900 placeholder-gray-400 bg-transparent border-none focus:ring-0 focus:outline-none"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isSearching || searchTerm.length < 3}
                                className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                                        <div key={product.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center hover:shadow-md transition-shadow">
                                            <div>
                                                <h3 className="text-lg font-bold text-gray-900">{product.name}</h3>
                                                {product.dci && (
                                                    <p className="text-sm text-gray-500">Principio Activo: {product.dci}</p>
                                                )}
                                            </div>
                                            <div className={cn(
                                                "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold",
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
                                <li><a href="#" className="hover:text-white transition-colors">Inicio</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Nosotros</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Sucursales</a></li>
                                <li><Link href="/login" className="hover:text-white transition-colors">Acceso Interno</Link></li>
                            </ul>
                        </div>
                        <div>
                            <h3 className="text-white font-bold mb-4">Síguenos</h3>
                            <div className="flex gap-4">
                                <a href="#" className="bg-gray-800 p-2 rounded-lg hover:bg-blue-600 hover:text-white transition-all">
                                    <Facebook size={20} />
                                </a>
                                <a href="#" className="bg-gray-800 p-2 rounded-lg hover:bg-pink-600 hover:text-white transition-all">
                                    <Instagram size={20} />
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
