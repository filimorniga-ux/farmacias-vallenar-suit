
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, MapPin, ArrowRight, Loader2, Warehouse } from 'lucide-react';
import { motion } from 'framer-motion';
import { getPublicLocationsSecure, PublicLocation } from '../../actions/public-network-v2';

const ContextSelectionPage: React.FC = () => {
    const navigate = useNavigate();
    const [publicLocations, setPublicLocations] = useState<PublicLocation[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Initial Load
    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            const res = await getPublicLocationsSecure();
            if (res.success && res.data) {
                setPublicLocations(res.data);
            }
            setIsLoading(false);
        };
        load();
    }, []);

    const handleLocationSelect = (loc: PublicLocation) => {
        // Save preference locally and in cookies for Server Components
        localStorage.setItem('preferred_location_id', loc.id);
        localStorage.setItem('preferred_location_name', loc.name);
        localStorage.setItem('preferred_location_type', loc.type);

        // Set cookie for Next.js Server Component check
        document.cookie = `preferred_location_id=${loc.id}; path=/; max-age=31536000`;

        // Force full reload to re-run server-side logic in page.tsx
        window.location.href = '/';
    };

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Ambience */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
                <div className="absolute top-[10%] left-[10%] w-96 h-96 bg-cyan-500/20 rounded-full blur-[128px]" />
                <div className="absolute bottom-[10%] right-[10%] w-96 h-96 bg-blue-600/20 rounded-full blur-[128px]" />
            </div>

            <div className="relative z-10 w-full max-w-5xl">

                <header className="mb-12 text-center">
                    <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-2">
                        Farmacias <span className="text-cyan-400">Vallenar</span> Suit
                    </h1>
                    <p className="text-slate-400 font-medium text-lg">Sistema ERP Clínico Integral</p>
                </header>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full"
                >
                    <h2 className="text-xl text-white font-bold mb-6 flex items-center justify-center gap-2">
                        <MapPin className="text-cyan-400" />
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
                                        className={`group relative bg-white/5 hover:bg-white/10 border ${isPreferred ? 'border-cyan-500 shadow-lg shadow-cyan-900/40' : 'border-white/10'} hover:border-cyan-500/50 rounded-2xl p-6 text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-cyan-900/20`}
                                    >
                                        <div className="flex items-start justify-between mb-4">
                                            <div className={`p-3 rounded-xl ${loc.type === 'HQ' ? 'bg-purple-500/20 text-purple-400' : loc.type === 'WAREHOUSE' ? 'bg-orange-500/20 text-orange-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
                                                {loc.type === 'WAREHOUSE' ? <Warehouse size={24} /> : <Store size={24} />}
                                            </div>
                                            {loc.type === 'HQ' && (
                                                <span className="bg-purple-500/20 text-purple-300 text-xs font-bold px-2 py-1 rounded-full uppercase">Casa Matriz</span>
                                            )}
                                            {isPreferred && (
                                                <span className="bg-cyan-500/20 text-cyan-300 text-xs font-bold px-2 py-1 rounded-full uppercase">Ultima sesión</span>
                                            )}
                                        </div>
                                        <h3 className="text-2xl font-bold text-white mb-1">{loc.name}</h3>
                                        <p className="text-slate-400 text-sm mb-4">{loc.address}</p>

                                        <div className="flex items-center text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-cyan-400 transition-colors">
                                            Seleccionar <ArrowRight size={14} className="ml-2 group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </motion.div>

                <footer className="mt-12 text-center text-slate-600 text-sm">
                    <p>&copy; 2025 Farmacias Vallenar. Todos los derechos reservados.</p>
                </footer>
            </div>
        </div>
    );
};

export default ContextSelectionPage;
