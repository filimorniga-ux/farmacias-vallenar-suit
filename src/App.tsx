'use client';
import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { usePharmaStore } from './presentation/store/useStore';
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

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const { user } = usePharmaStore();
    if (!user) return <Navigate to="/" replace />;
    return <SidebarLayout>{children}</SidebarLayout>;
};

const App: React.FC = () => {
    const { syncData } = usePharmaStore();

    useEffect(() => {
        syncData();
    }, []);

    return (
        <BrowserRouter>
            <Toaster position="top-center" richColors />
            <Routes>
                {/* Public Routes */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/kiosk" element={<AttendanceKioskPage />} />
                <Route path="/access" element={<AccessControlPage />} />
                <Route path="/queue" element={<QueueKioskPage />} />
                <Route path="/price-check" element={<PriceCheckPage />} />

                {/* Protected Routes */}
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
