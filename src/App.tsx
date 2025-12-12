'use client';
import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { usePharmaStore } from './presentation/store/useStore';
import { useLocationStore } from './presentation/store/useLocationStore';
import { Toaster } from 'sonner';

// Layouts
import SidebarLayout from './presentation/layouts/SidebarLayout';

// Pages
import LandingPage from './presentation/pages/LandingPage';
import DashboardPage from './presentation/pages/DashboardPage';
import POSMainScreen from './presentation/components/POSMainScreen';
import SupplyChainPage from './presentation/pages/SupplyChainPage';
import QueueKioskPage from './presentation/pages/QueueKioskPage';
import AccessControlPage from './presentation/pages/AccessControlPage';
import HRPage from './presentation/pages/HRPage';
import SettingsPage from './presentation/pages/SettingsPage';
import ClientsPage from './presentation/pages/ClientsPage';
import InventoryPage from './presentation/pages/InventoryPage';
import ReportsPage from './presentation/pages/ReportsPage';
import AttendanceKioskPage from './presentation/pages/AttendanceKioskPage';
import { WarehouseOps } from './presentation/pages/WarehouseOps';
import { SuppliersPage } from './presentation/pages/SuppliersPage';
import { SupplierProfile } from './presentation/pages/SupplierProfile';
import NetworkPage from './presentation/pages/NetworkPage';
import PriceCheckPage from './presentation/pages/PriceCheckPage';
import InventorySettings from './presentation/pages/settings/InventorySettings';
import ContextSelectionPage from './presentation/pages/ContextSelectionPage';
import PrintingSettingsPage from './presentation/pages/settings/PrintingSettingsPage';
import TreasuryPage from './app/finance/treasury/page';
import MonthlyClosingPage from './app/finance/monthly-closing/page';

// DEV NOTE: To test Mobile Native Experience (Camera, Swipe Tabs, Layout),
// use Chrome DevTools (F12) -> Toggle Device Toolbar (Cmd+Shift+M)
// and select "iPhone 12" or "Pixel 5".
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const { user } = usePharmaStore();
    if (!user) return <Navigate to="/" replace />;
    return <SidebarLayout>{children}</SidebarLayout>;
};

function App({ forceContextSelection }: { forceContextSelection?: boolean }) {
    const { syncData } = usePharmaStore();
    const { fetchLocations } = useLocationStore();

    useEffect(() => {
        syncData();
        fetchLocations();
    }, []);

    return (
        <BrowserRouter>
            <Toaster position="top-center" richColors />
            <Routes>
                {/* Public Routes */}
                <Route path="/" element={forceContextSelection ? <ContextSelectionPage /> : <LandingPage />} />
                <Route path="/kiosk" element={<AttendanceKioskPage />} />
                <Route path="/kiosk/setup" element={<AttendanceKioskPage />} /> {/* Protected by Internal UI Lock */}
                <Route path="/access" element={<AccessControlPage />} />
                <Route path="/queue" element={<QueueKioskPage />} />
                <Route path="/totem" element={<QueueKioskPage />} />
                <Route path="/totem/setup" element={<QueueKioskPage />} /> {/* Protected by Internal UI Lock */}
                <Route path="/price-check" element={<PriceCheckPage />} />
                <Route path="/select-context" element={<ContextSelectionPage />} />

                {/* Protected Routes */}
                <Route path="/settings/printing" element={<ProtectedRoute><PrintingSettingsPage /></ProtectedRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                <Route path="/pos" element={<ProtectedRoute><POSMainScreen /></ProtectedRoute>} />
                <Route path="/inventory" element={<ProtectedRoute><InventoryPage /></ProtectedRoute>} />
                <Route path="/inventory/maintenance" element={<ProtectedRoute><InventorySettings /></ProtectedRoute>} />
                <Route path="/warehouse" element={<ProtectedRoute><WarehouseOps /></ProtectedRoute>} />
                <Route path="/suppliers" element={<ProtectedRoute><SuppliersPage /></ProtectedRoute>} />
                <Route path="/suppliers/:id" element={<ProtectedRoute><SupplierProfile /></ProtectedRoute>} />
                <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
                <Route path="/supply-chain" element={<ProtectedRoute><SupplyChainPage /></ProtectedRoute>} />
                <Route path="/clients" element={<ProtectedRoute><ClientsPage /></ProtectedRoute>} />
                <Route path="/finance/treasury" element={<ProtectedRoute><TreasuryPage /></ProtectedRoute>} />
                <Route path="/finance/monthly-closing" element={<ProtectedRoute><MonthlyClosingPage /></ProtectedRoute>} />
                <Route path="/hr" element={<ProtectedRoute><HRPage /></ProtectedRoute>} />
                <Route path="/network" element={<ProtectedRoute><NetworkPage /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                <Route path="/admin" element={<Navigate to="/dashboard" replace />} />

                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
};

export default App;
