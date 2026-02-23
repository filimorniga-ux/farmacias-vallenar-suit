/**
 * WMSPage - Página principal del módulo WMS
 * 
 * Layout adaptativo:
 * - Móvil: Header sticky + Bottom Tab Bar + scroll independiente
 * - Desktop: Header normal + tabs horizontales arriba
 * 
 * Usa usePlatform() para detectar la plataforma (Capacitor/Electron/Web).
 * Skills: estilo-marca, modo-produccion, arquitecto-offline
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
    Warehouse, Truck, PackageCheck, ArrowLeftRight,
    PackagePlus, MapPin, RefreshCw, Route, History
} from 'lucide-react';
import { usePharmaStore } from '@/presentation/store/useStore';
import { useLocationStore } from '@/presentation/store/useLocationStore';
import { useQueryClient } from '@tanstack/react-query';
import { usePlatform } from '@/hooks/usePlatform';
import { useInventoryQuery } from '@/presentation/hooks/useInventoryQuery';
import { WMSDespachoTab } from '@/presentation/components/wms/tabs/WMSDespachoTab';
import { WMSRecepcionTab } from '@/presentation/components/wms/tabs/WMSRecepcionTab';
import { WMSTransferenciaTab } from '@/presentation/components/wms/tabs/WMSTransferenciaTab';
import { WMSTransitoTab } from '@/presentation/components/wms/tabs/WMSTransitoTab';
import { WMSPedidosTab } from '@/presentation/components/wms/tabs/WMSPedidosTab';
import { WMSBottomTabBar } from '@/presentation/components/wms/WMSBottomTabBar';
import { PurchaseOrderReceivingModal } from '@/presentation/components/scm/PurchaseOrderReceivingModal';
import ManualOrderModal from '@/presentation/components/supply/ManualOrderModal';
import SupplyKanban from '../components/supply/SupplyKanban';
import { SupplyChainHistoryTab } from '@/presentation/components/scm/SupplyChainHistoryTab';

export type WMSTab = 'despacho' | 'recepcion' | 'transferencia' | 'transito' | 'pedidos' | 'suministros' | 'historial';

const DESKTOP_TABS: { key: WMSTab; label: string; icon: React.ReactNode; color: string }[] = [
    { key: 'despacho', label: 'Despacho', icon: <Truck size={18} />, color: 'sky' },
    { key: 'recepcion', label: 'Recepción', icon: <PackageCheck size={18} />, color: 'emerald' },
    { key: 'transferencia', label: 'Transferencia', icon: <ArrowLeftRight size={18} />, color: 'purple' },
    { key: 'transito', label: 'En Tránsito', icon: <Route size={18} />, color: 'indigo' },
    { key: 'pedidos', label: 'Recep. Pedidos', icon: <PackagePlus size={18} />, color: 'amber' },
    { key: 'suministros', label: 'Kanban Suministros', icon: <Truck size={18} />, color: 'cyan' },
    { key: 'historial', label: 'Historial', icon: <History size={18} />, color: 'slate' },
];

const TAB_COLORS: Record<string, { active: string; ring: string }> = {
    sky: { active: 'bg-sky-500 text-white shadow-sky-500/30', ring: 'ring-sky-200' },
    emerald: { active: 'bg-emerald-500 text-white shadow-emerald-500/30', ring: 'ring-emerald-200' },
    purple: { active: 'bg-purple-500 text-white shadow-purple-500/30', ring: 'ring-purple-200' },
    indigo: { active: 'bg-indigo-500 text-white shadow-indigo-500/30', ring: 'ring-indigo-200' },
    amber: { active: 'bg-amber-500 text-white shadow-amber-500/30', ring: 'ring-amber-200' },
    cyan: { active: 'bg-cyan-500 text-white shadow-cyan-500/30', ring: 'ring-cyan-200' },
    slate: { active: 'bg-slate-700 text-white shadow-slate-700/30', ring: 'ring-slate-300' },
};


export const WMSPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<WMSTab>('despacho');
    const { isMobile, isDesktopLike, isLandscape } = usePlatform();
    const queryClient = useQueryClient();
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [isReceptionModalOpen, setIsReceptionModalOpen] = useState(false);
    const [isManualOrderModalOpen, setIsManualOrderModalOpen] = useState(false);
    const [preselectedReceptionShipmentId, setPreselectedReceptionShipmentId] = useState<string | null>(null);

    const {
        currentLocationId,
        currentWarehouseId,
        currentTerminalId,
        setCurrentLocation,
        locations: pharmaLocations,
        user,
        receivePurchaseOrder,
        setInventory,
        refreshShipments,
        refreshPurchaseOrders
    } = usePharmaStore();
    const locationStoreCurrent = useLocationStore(s => s.currentLocation);
    const locationStoreLocations = useLocationStore(s => s.locations);

    const resolvedLocation = useMemo(() => {
        const fromPharma = pharmaLocations.find(loc => loc.id === currentLocationId);
        if (fromPharma) return fromPharma;

        if (locationStoreCurrent) return locationStoreCurrent;

        const fromLocationStore = locationStoreLocations.find(loc => loc.id === currentLocationId);
        if (fromLocationStore) return fromLocationStore;

        return null;
    }, [currentLocationId, pharmaLocations, locationStoreCurrent, locationStoreLocations]);

    const currentLocationName = resolvedLocation?.name || 'Sin ubicación';
    const currentLocationType = resolvedLocation?.type || 'STORE';
    const useMobileLayout = isMobile && !isDesktopLike;

    useEffect(() => {
        const fallbackIds: string[] = [];
        try {
            const contextId = localStorage.getItem('context_location_id');
            const preferredId = localStorage.getItem('preferred_location_id');
            if (contextId) fallbackIds.push(contextId);
            if (preferredId) fallbackIds.push(preferredId);
        } catch {
            // localStorage may be unavailable in constrained environments
        }

        const targetId =
            currentLocationId ||
            locationStoreCurrent?.id ||
            user?.assigned_location_id ||
            fallbackIds.find(Boolean) ||
            '';

        if (!targetId) return;

        const targetLocation =
            pharmaLocations.find(loc => loc.id === targetId) ||
            locationStoreLocations.find(loc => loc.id === targetId) ||
            (locationStoreCurrent?.id === targetId ? locationStoreCurrent : undefined);

        const targetWarehouseId = currentWarehouseId || targetLocation?.default_warehouse_id || '';

        if (currentLocationId !== targetId || (targetWarehouseId && currentWarehouseId !== targetWarehouseId)) {
            setCurrentLocation(targetId, targetWarehouseId, currentTerminalId || '');
        }
    }, [
        currentLocationId,
        currentWarehouseId,
        currentTerminalId,
        setCurrentLocation,
        pharmaLocations,
        locationStoreLocations,
        locationStoreCurrent,
        user?.assigned_location_id,
    ]);

    // 🚀 Load inventory via React Query (Same pattern as POSMainScreen for consistency)
    const activeLocationId = currentLocationId || locationStoreCurrent?.id;
    const shouldLoadInventory = activeTab === 'despacho' || activeTab === 'transferencia';
    const { data: inventoryData, isLoading: isLoadingInventory } = useInventoryQuery(activeLocationId, {
        mode: 'wms-lite',
        enabled: shouldLoadInventory && !!activeLocationId,
    });

    // Sync React Query data to Zustand Store for compatibility with WMS Tabs
    useEffect(() => {
        if (inventoryData) {
            console.log('🔄 [WMS] Syncing Inventory Query -> Zustand');
            setInventory(inventoryData);
        }
    }, [inventoryData, setInventory]);

    const handleRefresh = async () => {
        if (activeLocationId) {
            await Promise.all([
                refreshShipments(activeLocationId),
                refreshPurchaseOrders(activeLocationId)
            ]);
        }
        queryClient.invalidateQueries({ queryKey: ['inventory'] });
        if ('vibrate' in navigator) navigator.vibrate(10);
    };

    const handleTabChange = (tab: WMSTab) => {
        setActiveTab(tab);
    };

    const renderTabContent = () => {
        switch (activeTab) {
            case 'despacho':
                return <WMSDespachoTab isLoading={isLoadingInventory} />;
            case 'recepcion':
                return (
                    <WMSRecepcionTab
                        preselectedShipmentId={preselectedReceptionShipmentId}
                        onPreselectionHandled={() => setPreselectedReceptionShipmentId(null)}
                    />
                );
            case 'transferencia':
                return <WMSTransferenciaTab isLoading={isLoadingInventory} />;
            case 'transito':
                return (
                    <WMSTransitoTab
                        onReceiveShipment={(shipmentId) => {
                            setPreselectedReceptionShipmentId(shipmentId);
                            setActiveTab('recepcion');
                        }}
                    />
                );
            case 'pedidos':
                return <WMSPedidosTab />;
            case 'historial':
                return <SupplyChainHistoryTab />;
            case 'suministros':
                return (
                    <div className="space-y-4">
                        <div className={useMobileLayout
                            ? "bg-white p-4 rounded-2xl shadow-sm border border-slate-200"
                            : "bg-white p-6 rounded-3xl shadow-sm border border-slate-200"
                        }>
                            <h3 className={useMobileLayout ? "font-bold text-slate-800 mb-1" : "text-xl font-bold text-slate-800 mb-2"}>
                                Espejo de Suministros
                            </h3>
                            <p className={useMobileLayout ? "text-xs text-slate-500 mb-4" : "text-sm text-slate-500 mb-6"}>
                                {useMobileLayout ? "Órdenes de compra sincronizadas." : "Visualización en tiempo real de órdenes de compra pendientes y recibidas."}
                            </p>
                            <SupplyKanban
                                direction={useMobileLayout ? 'col' : 'row'}
                                onEditOrder={(po: any) => {
                                    setSelectedOrder(po);
                                    setIsManualOrderModalOpen(true);
                                }}
                                onReceiveOrder={(po: any) => {
                                    setSelectedOrder(po);
                                    setIsReceptionModalOpen(true);
                                }}
                            />
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    // ─────────────────────────────────────────────
    // MOBILE LAYOUT — Native app feel
    // ─────────────────────────────────────────────
    if (useMobileLayout) {
        return (
            <div className="h-dvh flex flex-col bg-slate-50 no-select">
                {/* Sticky Header with Safe Area */}
                <header className="shrink-0 bg-white/90 backdrop-blur-lg border-b border-slate-200/60
                                 shadow-sm sticky top-0 z-40 pt-safe">
                    <div className="px-4 py-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 
                                              flex items-center justify-center shadow-lg shadow-sky-500/20">
                                    <Warehouse size={18} className="text-white" />
                                </div>
                                <div>
                                    <h1 className="text-base font-bold text-slate-900 leading-tight">
                                        WMS
                                    </h1>
                                    <div className="flex items-center gap-1">
                                        <MapPin size={10} className="text-sky-500" />
                                        <span className="text-[11px] text-slate-500 font-medium truncate max-w-[180px]">
                                            {currentLocationName}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleRefresh}
                                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 
                                         text-slate-600 transition-colors flex items-center justify-center
                                         active:scale-95"
                                title="Actualizar"
                            >
                                <RefreshCw size={16} />
                            </button>
                        </div>
                    </div>
                </header>

                {/* Scrollable Content — fills space between header and bottom bar */}
                <main className={`flex-1 overflow-y-auto wms-content-scroll px-4 py-4 ${isLandscape ? 'pb-24' : 'pb-36'}`}>
                    <div className="animate-in fade-in duration-200">
                        {renderTabContent()}
                    </div>
                </main>

                {/* Bottom Tab Bar — native style */}
                <WMSBottomTabBar
                    activeTab={activeTab}
                    onTabChange={handleTabChange}
                    bottomOffset={isLandscape ? 0 : 68}
                />

                {/* Modals for Supply Integration */}
                <PurchaseOrderReceivingModal
                    isOpen={isReceptionModalOpen}
                    onClose={() => setIsReceptionModalOpen(false)}
                    order={selectedOrder}
                    onReceive={(orderId, items) => {
                        return receivePurchaseOrder(
                            orderId,
                            items,
                            selectedOrder?.target_warehouse_id || currentWarehouseId || currentLocationId
                        );
                    }}
                />

                <ManualOrderModal
                    isOpen={isManualOrderModalOpen}
                    onClose={() => {
                        setIsManualOrderModalOpen(false);
                        setSelectedOrder(null);
                    }}
                    initialOrder={selectedOrder}
                />
            </div>
        );
    }

    // ─────────────────────────────────────────────
    // DESKTOP LAYOUT — Windows / Mac
    // ─────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 shadow-sm">
                <div className="max-w-[1400px] mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
                                <Warehouse size={20} className="text-white" />
                            </div>
                            <div>
                                <h1 className="text-lg font-bold text-slate-900">
                                    Gestión de Bodega
                                </h1>
                                <p className="text-xs text-slate-500">
                                    Sistema de Gestión de Almacenes
                                </p>
                            </div>
                        </div>

                        <button onClick={handleRefresh}
                            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                            title="Actualizar inventario">
                            <RefreshCw size={18} />
                        </button>
                    </div>

                    {/* Banner de ubicación */}
                    <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-sky-50 border border-sky-200 rounded-xl">
                        <MapPin size={14} className="text-sky-600 shrink-0" />
                        <span className="text-sm font-semibold text-sky-800">
                            {currentLocationName}
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-sky-100 text-sky-600 rounded-full font-medium">
                            {currentLocationType === 'STORE' ? 'Sucursal' : currentLocationType === 'WAREHOUSE' ? 'Bodega' : 'Central'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Desktop Tabs */}
            <div className="bg-white border-b border-slate-200">
                <div className="max-w-[1400px] mx-auto px-4">
                    <div className="flex flex-wrap gap-1.5 py-2">
                        {DESKTOP_TABS.map(tab => {
                            const isActive = activeTab === tab.key;
                            const colors = TAB_COLORS[tab.color];
                            return (
                                <button key={tab.key} onClick={() => handleTabChange(tab.key)}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm whitespace-nowrap transition-all duration-200
                                        ${isActive
                                            ? `${colors.active} shadow-lg`
                                            : 'text-slate-600 hover:bg-slate-100'
                                        }`}>
                                    {tab.icon}
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Desktop Content */}
            <div className="max-w-[1400px] mx-auto px-4 py-6">
                <div className="animate-in fade-in duration-200">
                    {renderTabContent()}
                </div>
            </div>

            {/* Modals for Supply Integration (Desktop) */}
            <PurchaseOrderReceivingModal
                isOpen={isReceptionModalOpen}
                onClose={() => setIsReceptionModalOpen(false)}
                order={selectedOrder}
                onReceive={(orderId, items) => {
                    return receivePurchaseOrder(
                        orderId,
                        items,
                        selectedOrder?.target_warehouse_id || currentWarehouseId || currentLocationId
                    );
                }}
            />

            <ManualOrderModal
                isOpen={isManualOrderModalOpen}
                onClose={() => {
                    setIsManualOrderModalOpen(false);
                    setSelectedOrder(null);
                }}
                initialOrder={selectedOrder}
            />
        </div>
    );
};

export default WMSPage;
