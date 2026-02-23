
import React, { useState, useEffect, useCallback } from 'react';
import { Store, MapPin, ArrowRight, Warehouse, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { getPublicLocationsSecure, PublicLocation } from '../../actions/public-network-v2';

const ContextSelectionPage: React.FC = () => {
    const [publicLocations, setPublicLocations] = useState<PublicLocation[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [errorRef, setErrorRef] = useState<string | null>(null);
    const [fallbackLocation, setFallbackLocation] = useState<PublicLocation | null>(null);

    const loadPublicLocations = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setErrorRef(null);

        try {
            const res = await getPublicLocationsSecure();
            if (res.success) {
                setPublicLocations(res.data);
                return;
            }

            const failure = res;
            const userMessage = failure.userMessage || failure.error || 'Error desconocido al cargar sucursales';
            setError(userMessage);
            setErrorRef(failure.correlationId ? failure.correlationId.slice(0, 8) : null);
        } catch {
            setError('No fue posible cargar sucursales en este momento.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Initial Load
    useEffect(() => {
        let isMounted = true;
        const storedId = localStorage.getItem('preferred_location_id');
        const storedName = localStorage.getItem('preferred_location_name');
        const storedType = localStorage.getItem('preferred_location_type');

        if (storedId && isMounted) {
            const resolvedType = storedType === 'WAREHOUSE' || storedType === 'HQ' ? storedType : 'STORE';
            setFallbackLocation({
                id: storedId,
                name: storedName || 'Última sucursal',
                type: resolvedType,
                address: '',
            });
        }

        if (isMounted) {
            void loadPublicLocations();
        }

        return () => { isMounted = false; };
    }, [loadPublicLocations]);

    const handleLocationSelect = (loc: PublicLocation) => {
        // 1. Save preference locally (Client-Side State)
        localStorage.setItem('preferred_location_id', loc.id);
        localStorage.setItem('preferred_location_name', loc.name);
        localStorage.setItem('preferred_location_type', loc.type);

        // 2. Clear potential conflicting cookies
        document.cookie = "preferred_location_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";

        // 3. Set cookie for Server-Side props (Next.js)
        // Adding SameSite=Lax to ensure it sticks across navigations
        document.cookie = `preferred_location_id=${loc.id}; path=/; max-age=31536000; SameSite=Lax`;

        // 4. Force full reload to update Server Context
        // Using replace to avoid back-button causing loops
        window.location.replace(`/?t=${Date.now()}`);
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Ambience - Light Clinical Blue/Teal */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
                <div className="absolute top-[5%] left-[10%] w-[600px] h-[600px] bg-sky-200/40 rounded-full blur-[120px]" />
                <div className="absolute bottom-[5%] right-[10%] w-[600px] h-[600px] bg-teal-100/30 rounded-full blur-[120px]" />
            </div>

            <div className="relative z-10 w-full max-w-5xl">

                <header className="mb-12 text-center">
                    <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900 tracking-tight mb-3">
                        Farmacias <span className="text-sky-600">Vallenar</span> Suit
                    </h1>
                    <p className="text-sky-100/70 font-light text-lg tracking-wide">Sistema ERP Clínico Integral</p>
                </header>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full"
                >
                    <h2 className="text-xl text-slate-800 font-bold mb-6 flex items-center justify-center gap-2">
                        <MapPin className="text-sky-600" />
                        ¿Dónde inicias turno hoy?
                    </h2>

                    {isLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-48 bg-white/5 rounded-2xl border border-white/5 p-6">
                                    <div className="w-12 h-12 bg-white/10 rounded-xl mb-4" />
                                    <div className="h-8 w-3/4 bg-white/10 rounded-lg mb-2" />
                                    <div className="h-4 w-1/2 bg-white/5 rounded-lg mb-6" />
                                    <div className="h-8 w-1/3 bg-white/10 rounded-full" />
                                </div>
                            ))}
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center p-12 text-center text-red-500 bg-red-50 rounded-2xl border border-red-100">
                            <Store size={48} className="mb-4 opacity-50" />
                            <h3 className="text-xl font-bold mb-2">Error de Conexión</h3>
                            <p className="text-sm font-mono max-w-md">{error}</p>
                            {errorRef && (
                                <p className="text-xs mt-2 text-red-400 font-semibold">Ref soporte: {errorRef}</p>
                            )}
                            <div className="mt-4 flex flex-wrap justify-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => void loadPublicLocations()}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors"
                                >
                                    <RefreshCw size={16} />
                                    Reintentar
                                </button>
                                {fallbackLocation && (
                                    <button
                                        type="button"
                                        onClick={() => handleLocationSelect(fallbackLocation)}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-red-200 text-red-600 hover:bg-red-100 font-semibold transition-colors"
                                    >
                                        Usar última sucursal
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : publicLocations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500">
                            <Store size={48} className="mb-4 opacity-20" />
                            <h3 className="text-xl font-bold mb-2">No hay sucursales configuradas</h3>
                            <p className="text-sm">Ingrese como SuperAdmin para configurar la red.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {publicLocations.map(loc => {
                                const isPreferred = localStorage.getItem('preferred_location_id') === loc.id;
                                return (
                                    <button
                                        key={loc.id}
                                        onClick={() => handleLocationSelect(loc)}
                                        className={`group relative bg-white border ${isPreferred ? 'border-sky-500 shadow-xl shadow-sky-900/10' : 'border-slate-100'} hover:border-sky-400 rounded-2xl p-6 text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-sky-900/5`}
                                    >
                                        <div className="flex items-start justify-between mb-4">
                                            <div className={`p-3 rounded-xl ${loc.type === 'HQ' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : loc.type === 'WAREHOUSE' ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-sky-50 text-sky-600 border border-sky-100'}`}>
                                                {loc.type === 'WAREHOUSE' ? <Warehouse size={24} /> : <Store size={24} />}
                                            </div>
                                            {loc.type === 'HQ' && (
                                                <span className="bg-indigo-50 text-indigo-600 border border-indigo-100 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Casa Matriz</span>
                                            )}
                                            {isPreferred && (
                                                <span className="bg-sky-50 text-sky-600 border border-sky-100 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Ultima sesión</span>
                                            )}
                                        </div>
                                        <h3 className="text-2xl font-bold text-slate-800 mb-1">{loc.name}</h3>
                                        <p className="text-slate-500 text-sm mb-4 leading-relaxed">{loc.address}</p>

                                        <div className="flex items-center text-xs font-bold text-slate-400 uppercase tracking-wider group-hover:text-sky-600 transition-colors">
                                            Seleccionar <ArrowRight size={14} className="ml-2 group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </motion.div>

                <footer className="mt-12 text-center text-slate-400 text-sm">
                    <p>&copy; 2025 Farmacias Vallenar. Todos los derechos reservados.</p>
                </footer>
            </div>
        </div>
    );
};

export default ContextSelectionPage;
