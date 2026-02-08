import React, { useState } from 'react';
import { usePharmaStore } from '../store/useStore';
import { Promotion, GiftCard, LoyaltyReward } from '../../domain/types';
import { Plus, Tag, Gift, Award, Calendar, Trash2, Power, Search, Printer, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

const MarketingPage: React.FC = () => {
    const {
        promotions, addPromotion, togglePromotion,
        giftCards, createGiftCard,
        loyaltyRewards
    } = usePharmaStore();

    const [activeTab, setActiveTab] = useState<'CAMPAIGNS' | 'GIFTCARDS' | 'LOYALTY'>('CAMPAIGNS');

    // Promotion Form State
    const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
    const [newPromoName, setNewPromoName] = useState('');
    const [newPromoType, setNewPromoType] = useState<Promotion['type']>('PERCENTAGE');
    const [newPromoValue, setNewPromoValue] = useState(0);

    // Gift Card Form State
    const [giftAmount, setGiftAmount] = useState(10000);
    const [lastCreatedCard, setLastCreatedCard] = useState<GiftCard | null>(null);

    const handleCreatePromotion = () => {
        if (!newPromoName || newPromoValue <= 0) return;

        const newPromo: Promotion = {
            id: `PROMO-${Date.now()}`,
            name: newPromoName,
            type: newPromoType,
            value: newPromoValue,
            startDate: Date.now(),
            endDate: Date.now() + (7 * 24 * 60 * 60 * 1000), // 1 week default
            isActive: true,
            days_of_week: [0, 1, 2, 3, 4, 5, 6] // All days
        };

        addPromotion(newPromo);
        setIsPromoModalOpen(false);
        setNewPromoName('');
        setNewPromoValue(0);
        toast.success('Promoción creada exitosamente');
    };

    const handleCreateGiftCard = () => {
        const card = createGiftCard(giftAmount);
        setLastCreatedCard(card);
        toast.success('Gift Card generada');
    };

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto min-h-dvh pb-safe">
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
                    <Award className="text-purple-600" size={32} />
                    Marketing & Fidelización
                </h1>
                <p className="text-slate-500 mt-2">Gestiona campañas, tarjetas de regalo y recompensas.</p>
            </header>

            {/* Tabs */}
            <div className="flex gap-4 mb-8 border-b border-gray-200 overflow-x-auto touch-pan-x no-scrollbar">
                <button
                    onClick={() => setActiveTab('CAMPAIGNS')}
                    className={`pb-4 px-4 font-bold flex items-center gap-2 transition whitespace-nowrap ${activeTab === 'CAMPAIGNS' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    <Tag size={20} /> Campañas
                </button>
                <button
                    onClick={() => setActiveTab('GIFTCARDS')}
                    className={`pb-4 px-4 font-bold flex items-center gap-2 transition whitespace-nowrap ${activeTab === 'GIFTCARDS' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    <Gift size={20} /> Gift Cards
                </button>
                <button
                    onClick={() => setActiveTab('LOYALTY')}
                    className={`pb-4 px-4 font-bold flex items-center gap-2 transition whitespace-nowrap ${activeTab === 'LOYALTY' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    <Award size={20} /> Club de Puntos
                </button>
            </div>

            {/* Content */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 min-h-[500px]">

                {/* --- CAMPAIGNS TAB --- */}
                {activeTab === 'CAMPAIGNS' && (
                    <div>
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-gray-800">Promociones Activas</h2>
                            <button
                                onClick={() => setIsPromoModalOpen(true)}
                                className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-purple-700 transition flex items-center gap-2"
                            >
                                <Plus size={20} /> Nueva Promo
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {promotions.map((promo: Promotion) => (
                                <div key={promo.id} className={`border rounded-xl p-4 relative ${promo.isActive ? 'border-purple-200 bg-purple-50' : 'border-gray-200 bg-gray-50 opacity-75'}`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="bg-white p-2 rounded-lg shadow-sm">
                                            <Tag className="text-purple-600" size={24} />
                                        </div>
                                        <button
                                            onClick={() => togglePromotion(promo.id)}
                                            className={`p-1 rounded-full transition ${promo.isActive ? 'text-green-600 bg-green-100' : 'text-gray-400 bg-gray-200'}`}
                                        >
                                            <Power size={20} />
                                        </button>
                                    </div>
                                    <h3 className="font-bold text-lg text-gray-800 mb-1">{promo.name}</h3>
                                    <p className="text-sm text-gray-500 mb-4">
                                        {promo.type === 'PERCENTAGE' ? `${promo.value}% Descuento` : `$${promo.value} Descuento Fijo`}
                                    </p>
                                    <div className="flex items-center gap-2 text-xs text-gray-400">
                                        <Calendar size={14} />
                                        <span>Hasta {new Date(promo.endDate).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            ))}
                            {promotions.length === 0 && (
                                <div className="col-span-full text-center py-12 text-gray-400">
                                    No hay promociones activas. Crea una para comenzar.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* --- GIFT CARDS TAB --- */}
                {activeTab === 'GIFTCARDS' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div>
                            <h2 className="text-xl font-bold text-gray-800 mb-6">Generar Gift Card</h2>
                            <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                                <label className="block text-sm font-bold text-gray-500 mb-2">Monto a Cargar</label>
                                <div className="relative mb-4">
                                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                    <input
                                        type="number"
                                        value={giftAmount}
                                        onChange={(e) => setGiftAmount(Number(e.target.value))}
                                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 focus:border-purple-500 focus:outline-none text-xl font-bold text-gray-800"
                                    />
                                </div>
                                <button
                                    onClick={handleCreateGiftCard}
                                    className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-700 transition flex justify-center items-center gap-2"
                                >
                                    <Gift size={20} /> Crear Tarjeta
                                </button>
                            </div>

                            {lastCreatedCard && (
                                <div className="mt-6 bg-gradient-to-r from-purple-600 to-indigo-600 p-6 rounded-xl text-white shadow-lg relative overflow-hidden animate-in zoom-in duration-300">
                                    <div className="absolute top-0 right-0 p-4 opacity-20">
                                        <Gift size={100} />
                                    </div>
                                    <p className="text-purple-200 text-sm font-bold uppercase tracking-wider mb-1">Farmacias Vallenar</p>
                                    <h3 className="text-3xl font-bold mb-8">${lastCreatedCard.initial_balance.toLocaleString()}</h3>
                                    <div className="bg-white/20 backdrop-blur-md p-3 rounded-lg inline-block mb-2">
                                        <p className="font-mono text-xl tracking-widest">{lastCreatedCard.code}</p>
                                    </div>
                                    <p className="text-xs text-purple-200 mt-2">Expira: {new Date(lastCreatedCard.created_at + 31536000000).toLocaleDateString()}</p>

                                    <button className="mt-4 bg-white text-purple-700 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-purple-50 transition">
                                        <Printer size={16} /> Imprimir Voucher
                                    </button>
                                </div>
                            )}
                        </div>

                        <div>
                            <h2 className="text-xl font-bold text-gray-800 mb-6">Historial Reciente</h2>
                            <div className="space-y-3">
                                {giftCards.slice().reverse().slice(0, 5).map((card: GiftCard) => (
                                    <div key={card.code} className="flex justify-between items-center p-3 border border-gray-100 rounded-lg hover:bg-gray-50">
                                        <div>
                                            <p className="font-bold text-gray-800">{card.code}</p>
                                            <p className="text-xs text-gray-500">Saldo: ${card.balance.toLocaleString()}</p>
                                        </div>
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${card.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                            {card.status}
                                        </span>
                                    </div>
                                ))}
                                {giftCards.length === 0 && <p className="text-gray-400 text-sm">No hay tarjetas generadas.</p>}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- LOYALTY TAB --- */}
                {activeTab === 'LOYALTY' && (
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 mb-6">Catálogo de Canjes</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {loyaltyRewards.map((reward: LoyaltyReward) => (
                                <div key={reward.id} className="border border-gray-200 rounded-xl p-6 flex flex-col items-center text-center hover:shadow-md transition">
                                    <div className="bg-yellow-100 p-4 rounded-full text-yellow-600 mb-4">
                                        <Award size={32} />
                                    </div>
                                    <h3 className="font-bold text-lg text-gray-800">{reward.name}</h3>
                                    <p className="text-sm text-gray-500 mb-4">{reward.description}</p>
                                    <div className="mt-auto bg-slate-800 text-white px-4 py-1 rounded-full text-sm font-bold">
                                        {reward.points_cost} Pts
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

            </div>

            {/* New Promo Modal */}
            {isPromoModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
                    <div className="bg-white rounded-2xl p-4 md:p-6 w-full max-w-md shadow-2xl animate-in zoom-in duration-200 m-4">
                        <h2 className="text-xl font-bold mb-4">Nueva Promoción</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-500 mb-1">Nombre</label>
                                <input
                                    type="text"
                                    className="w-full p-2 border rounded-lg"
                                    value={newPromoName}
                                    onChange={e => setNewPromoName(e.target.value)}
                                    placeholder="Ej: Lunes de Vitaminas"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-500 mb-1">Tipo</label>
                                    <select
                                        className="w-full p-2 border rounded-lg"
                                        value={newPromoType}
                                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewPromoType(e.target.value as any)}
                                    >
                                        <option value="PERCENTAGE">Porcentaje (%)</option>
                                        <option value="FIXED_AMOUNT">Monto Fijo ($)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-500 mb-1">Valor</label>
                                    <input
                                        type="number"
                                        className="w-full p-2 border rounded-lg"
                                        value={newPromoValue}
                                        onChange={e => setNewPromoValue(Number(e.target.value))}
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2 pt-4">
                                <button
                                    onClick={() => setIsPromoModalOpen(false)}
                                    className="flex-1 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleCreatePromotion}
                                    className="flex-1 py-2 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700"
                                >
                                    Crear
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MarketingPage;
