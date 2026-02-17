import React, { useMemo, useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usePharmaStore } from '../store/useStore';
import {
    ArrowLeft, Building2, Mail, Phone, Globe,
    FileText, CreditCard, History, Package, Bot, Eye
} from 'lucide-react';
import SupplierAccountUploadModal from '../components/suppliers/SupplierAccountUploadModal';
import SupplierCatalogUploadModal from '../components/suppliers/SupplierCatalogUploadModal';
import SupplierFilePreviewModal from '../components/suppliers/SupplierFilePreviewModal';
import { toast } from 'sonner';
import { SupplierAccountDocument, SupplierCatalogFile } from '../../domain/types';

export const SupplierProfile = () => {
    const { id } = useParams();
    const { suppliers, purchaseOrders } = usePharmaStore();
    const [activeTab, setActiveTab] = useState<'PROFILE' | 'HISTORY' | 'ACCOUNT' | 'ACCOUNT_AI' | 'PRODUCTS'>('PROFILE');
    const [accountDocs, setAccountDocs] = useState<SupplierAccountDocument[]>([]);
    const [invoiceParsings, setInvoiceParsings] = useState<any[]>([]);
    const [selectedParsing, setSelectedParsing] = useState<any | null>(null);
    const [catalogFiles, setCatalogFiles] = useState<SupplierCatalogFile[]>([]);
    const [accountSearch, setAccountSearch] = useState('');
    const [accountFrom, setAccountFrom] = useState('');
    const [accountTo, setAccountTo] = useState('');
    const [catalogFrom, setCatalogFrom] = useState('');
    const [catalogTo, setCatalogTo] = useState('');
    const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
    const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewTitle, setPreviewTitle] = useState('');
    const [previewFileName, setPreviewFileName] = useState('');
    const [previewFileMime, setPreviewFileMime] = useState('');
    const [previewBase64, setPreviewBase64] = useState('');
    const [previewDownload, setPreviewDownload] = useState<(() => void) | null>(null);
    const [isLoadingAccount, setIsLoadingAccount] = useState(false);
    const [isLoadingParsings, setIsLoadingParsings] = useState(false);
    const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);

    const supplier = suppliers.find(s => s.id === id);

    const supplierOrders = purchaseOrders.filter(po => po.supplier_id === id);

    const fetchAccountDocs = async (supplierId: string) => {
        setIsLoadingAccount(true);
        const { listSupplierAccountDocumentsSecure } = await import('@/actions/supplier-account-v2');
        const result = await listSupplierAccountDocumentsSecure({ supplierId });
        if (result.success && result.data) {
            setAccountDocs(result.data as SupplierAccountDocument[]);
        } else if (!result.success) {
            toast.error(result.error || 'Error cargando cuenta corriente');
        }
        setIsLoadingAccount(false);
    };

    const fetchParsings = async (supplierId: string) => {
        setIsLoadingParsings(true);
        const { getParsingsBySupplierIdSecure } = await import('@/actions/invoice-parser-v2');
        const result = await getParsingsBySupplierIdSecure(supplierId);
        if (result.success && result.data) {
            setInvoiceParsings(result.data);
        } else if (!result.success) {
            toast.error(result.error || 'Error cargando recepciones IA');
        }
        setIsLoadingParsings(false);
    };

    const fetchCatalogs = async (supplierId: string) => {
        setIsLoadingCatalog(true);
        const { listSupplierCatalogFilesSecure } = await import('@/actions/supplier-account-v2');
        const result = await listSupplierCatalogFilesSecure({ supplierId });
        if (result.success && result.data) {
            setCatalogFiles(result.data as SupplierCatalogFile[]);
        } else if (!result.success) {
            toast.error(result.error || 'Error cargando catálogos');
        }
        setIsLoadingCatalog(false);
    };

    useEffect(() => {
        if (!id) return;
        fetchAccountDocs(id);
        fetchParsings(id);
        fetchCatalogs(id);
    }, [id]);

    const totalDebt = useMemo(() => {
        return accountDocs
            .filter(d => d.type === 'FACTURA' && d.status === 'PENDING')
            .reduce((sum, d) => sum + Number(d.amount || 0), 0);
    }, [accountDocs]);

    const filteredAccountDocs = useMemo(() => {
        return accountDocs.filter(doc => {
            const matchesNumber = accountSearch
                ? doc.invoice_number?.toLowerCase().includes(accountSearch.toLowerCase())
                : true;
            const uploadDate = doc.uploaded_at ? new Date(doc.uploaded_at).getTime() : 0;
            const fromOk = accountFrom ? uploadDate >= new Date(accountFrom).getTime() : true;
            const toOk = accountTo ? uploadDate <= new Date(accountTo).getTime() : true;
            return matchesNumber && fromOk && toOk;
        });
    }, [accountDocs, accountSearch, accountFrom, accountTo]);

    const filteredCatalogs = useMemo(() => {
        return catalogFiles.filter(file => {
            const uploadDate = file.uploaded_at ? new Date(file.uploaded_at).getTime() : 0;
            const fromOk = catalogFrom ? uploadDate >= new Date(catalogFrom).getTime() : true;
            const toOk = catalogTo ? uploadDate <= new Date(catalogTo).getTime() : true;
            return fromOk && toOk;
        });
    }, [catalogFiles, catalogFrom, catalogTo]);

    if (!supplier) {
        return (
            <div className="p-10 text-center">
                <h2 className="text-xl font-bold text-gray-800">Proveedor no encontrado</h2>
                <Link to="/suppliers" className="text-blue-600 hover:underline mt-2 block">Volver al directorio</Link>
            </div>
        );
    }


    const handleDownloadAccountDoc = async (docId: string) => {
        const { getSupplierAccountDocumentFileSecure } = await import('@/actions/supplier-account-v2');
        const result = await getSupplierAccountDocumentFileSecure(docId);
        if (!result.success || !result.data) {
            toast.error(result.error || 'No se pudo descargar');
            return;
        }
        const { base64, fileName, fileMime } = result.data;
        const link = document.createElement('a');
        link.href = `data:${fileMime};base64,${base64}`;
        link.download = fileName;
        link.click();
    };

    const handleDownloadCatalog = async (fileId: string) => {
        const { getSupplierCatalogFileSecure } = await import('@/actions/supplier-account-v2');
        const result = await getSupplierCatalogFileSecure(fileId);
        if (!result.success || !result.data) {
            toast.error(result.error || 'No se pudo descargar');
            return;
        }
        const { base64, fileName, fileMime } = result.data;
        const link = document.createElement('a');
        link.href = `data:${fileMime};base64,${base64}`;
        link.download = fileName;
        link.click();
    };

    const handlePreviewAccountDoc = async (docId: string, title: string) => {
        const { getSupplierAccountDocumentFileSecure } = await import('@/actions/supplier-account-v2');
        const result = await getSupplierAccountDocumentFileSecure(docId);
        if (!result.success || !result.data) {
            toast.error(result.error || 'No se pudo abrir');
            return;
        }
        setPreviewTitle(title);
        setPreviewFileName(result.data.fileName);
        setPreviewFileMime(result.data.fileMime);
        setPreviewBase64(result.data.base64);
        setPreviewDownload(() => () => handleDownloadAccountDoc(docId));
        setIsPreviewOpen(true);
    };

    const handlePreviewCatalog = async (fileId: string, title: string) => {
        const { getSupplierCatalogFileSecure } = await import('@/actions/supplier-account-v2');
        const result = await getSupplierCatalogFileSecure(fileId);
        if (!result.success || !result.data) {
            toast.error(result.error || 'No se pudo abrir');
            return;
        }
        setPreviewTitle(title);
        setPreviewFileName(result.data.fileName);
        setPreviewFileMime(result.data.fileMime);
        setPreviewBase64(result.data.base64);
        setPreviewDownload(() => () => handleDownloadCatalog(fileId));
        setIsPreviewOpen(true);
    };

    const handleDeleteAccountDoc = async (docId: string, label: string) => {
        if (!confirm(`¿Eliminar ${label}? Esta acción no se puede deshacer.`)) return;
        const { deleteSupplierAccountDocumentSecure } = await import('@/actions/supplier-account-v2');
        const result = await deleteSupplierAccountDocumentSecure(docId);
        if (result.success) {
            toast.success('Documento eliminado');
            fetchAccountDocs(supplier.id);
        } else {
            toast.error(result.error || 'Error al eliminar documento');
        }
    };

    const handleDeleteCatalog = async (fileId: string, label: string) => {
        if (!confirm(`¿Eliminar ${label}? Esta acción no se puede deshacer.`)) return;
        const { deleteSupplierCatalogFileSecure } = await import('@/actions/supplier-account-v2');
        const result = await deleteSupplierCatalogFileSecure(fileId);
        if (result.success) {
            toast.success('Catálogo eliminado');
            fetchCatalogs(supplier.id);
        } else {
            toast.error(result.error || 'Error al eliminar catálogo');
        }
    };

    return (
        <div className="min-h-dvh bg-slate-50 pb-safe">
            {/* Header / Hero */}
            <div className="bg-white border-b border-slate-200 shadow-sm">
                <div className="max-w-7xl mx-auto px-6 py-6">
                    <Link to="/suppliers" className="inline-flex items-center text-slate-500 hover:text-slate-800 mb-4 transition-colors">
                        <ArrowLeft size={16} className="mr-1" /> Volver al Directorio
                    </Link>

                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center border border-slate-200">
                                {supplier.logo_url ? (
                                    <img src={supplier.logo_url} alt={supplier.fantasy_name} className="w-full h-full object-contain rounded-xl" />
                                ) : (
                                    <Building2 size={32} className="text-slate-400" />
                                )}
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-slate-900">{supplier.fantasy_name}</h1>
                                <div className="flex items-center gap-2 text-slate-500 text-sm">
                                    <span>{supplier.business_name}</span>
                                    <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                    <span>{supplier.rut}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <div className="text-right px-4 py-2 bg-red-50 border border-red-100 rounded-lg">
                                <p className="text-xs text-red-600 font-semibold uppercase">Deuda Actual</p>
                                <p className="text-xl font-bold text-red-700">${totalDebt.toLocaleString()}</p>
                            </div>
                            <div className="text-right px-4 py-2 bg-blue-50 border border-blue-100 rounded-lg">
                                <p className="text-xs text-blue-600 font-semibold uppercase">Lead Time</p>
                                <p className="text-xl font-bold text-blue-700">{supplier.lead_time_days} Días</p>
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-6 mt-8 border-b border-slate-200 overflow-x-auto touch-pan-x no-scrollbar">
                        {[
                            { id: 'PROFILE', label: 'Perfil & Contacto', icon: Building2 },
                            { id: 'HISTORY', label: 'Historial Pedidos', icon: History },
                            { id: 'ACCOUNT', label: 'Cuenta Corriente', icon: CreditCard },
                            { id: 'ACCOUNT_AI', label: 'Recepciones IA', icon: Bot },
                            { id: 'PRODUCTS', label: 'Productos', icon: Package },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`pb-3 px-2 flex items-center gap-2 font-medium text-sm transition-colors relative ${activeTab === tab.id
                                    ? 'text-blue-600'
                                    : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                <tab.icon size={18} />
                                {tab.label}
                                {activeTab === tab.id && (
                                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full"></span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-6 py-8">
                {activeTab === 'PROFILE' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Main Info */}
                        <div className="lg:col-span-2 space-y-6">
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <Building2 size={20} className="text-blue-600" />
                                    Información Comercial
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Razón Social</label>
                                        <p className="text-slate-800 font-medium">{supplier.business_name}</p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">RUT</label>
                                        <p className="text-slate-800 font-medium">{supplier.rut}</p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Sitio Web</label>
                                        <a href={supplier.website} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                                            {supplier.website || 'No registrado'} <Globe size={14} />
                                        </a>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Condición de Pago</label>
                                        <span className="inline-block px-2 py-1 bg-slate-100 rounded text-slate-700 text-sm font-medium">
                                            {supplier.payment_terms.replace('_', ' ')}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <CreditCard size={20} className="text-blue-600" />
                                    Datos Bancarios
                                </h3>
                                {supplier.bank_account ? (
                                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-xs text-slate-500">Banco</p>
                                                <p className="font-medium text-slate-800">{supplier.bank_account.bank}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-500">Tipo Cuenta</p>
                                                <p className="font-medium text-slate-800">{supplier.bank_account.account_type}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-500">Número</p>
                                                <p className="font-mono font-medium text-slate-800">{supplier.bank_account.account_number}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-500">Email Notificación</p>
                                                <p className="font-medium text-slate-800">{supplier.bank_account.email_notification}</p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-slate-500 italic">No hay datos bancarios registrados.</div>
                                )}
                            </div>
                        </div>

                        {/* Contacts Sidebar */}
                        <div className="space-y-6">
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="text-lg font-bold text-slate-800 mb-4">Contactos</h3>
                                <div className="space-y-4">
                                    {(supplier.contacts || []).map((contact, idx) => (
                                        <div key={idx} className="pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                                            <div className="flex justify-between items-start">
                                                <p className="font-bold text-slate-800">{contact.name}</p>
                                                {contact.is_primary && (
                                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full">PRINCIPAL</span>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-500 mb-2">{contact.role}</p>
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 text-sm text-slate-600">
                                                    <Mail size={14} /> <a href={`mailto:${contact.email}`} className="hover:text-blue-600">{contact.email}</a>
                                                </div>
                                                <div className="flex items-center gap-2 text-sm text-slate-600">
                                                    <Phone size={14} /> <span>{contact.phone}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {(!supplier.contacts || supplier.contacts.length === 0) && (
                                        <p className="text-slate-500 text-sm">No hay contactos registrados.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'HISTORY' && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden overflow-x-auto touch-pan-x">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4">ID Orden</th>
                                    <th className="px-6 py-4">Fecha</th>
                                    <th className="px-6 py-4">Estado</th>
                                    <th className="px-6 py-4 text-right">Monto</th>
                                    <th className="px-6 py-4 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {supplierOrders.length > 0 ? supplierOrders.map(po => (
                                    <tr key={po.id} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 font-medium text-slate-900">{po.id}</td>
                                        <td className="px-6 py-4 text-slate-600">{new Date(po.created_at).toLocaleDateString()}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${po.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                                po.status === 'SENT' ? 'bg-yellow-100 text-yellow-700' :
                                                    'bg-slate-100 text-slate-700'
                                                }`}>
                                                {po.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right font-medium text-slate-900">
                                            ${(po.total_estimated ?? 0).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button className="text-blue-600 hover:text-blue-800 font-medium text-xs">Ver Detalle</button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                                            No hay órdenes de compra registradas.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'ACCOUNT' && (
                    <div className="space-y-6">
                        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                <div>
                                    <label className="text-xs font-semibold text-slate-500 uppercase">Buscar N° Factura</label>
                                    <input
                                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                        value={accountSearch}
                                        onChange={(e) => setAccountSearch(e.target.value)}
                                        placeholder="Ej: 12345"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-slate-500 uppercase">Desde</label>
                                    <input
                                        type="date"
                                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                        value={accountFrom}
                                        onChange={(e) => setAccountFrom(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-slate-500 uppercase">Hasta</label>
                                    <input
                                        type="date"
                                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                        value={accountTo}
                                        onChange={(e) => setAccountTo(e.target.value)}
                                    />
                                </div>
                            </div>
                            <button
                                onClick={() => setIsAccountModalOpen(true)}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm font-medium"
                            >
                                <PlusIcon /> Nueva Factura / NC
                            </button>
                        </div>
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden overflow-x-auto touch-pan-x">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                    <tr>
                                        <th className="px-6 py-4">Fecha Carga</th>
                                        <th className="px-6 py-4">N° Documento</th>
                                        <th className="px-6 py-4">Tipo</th>
                                        <th className="px-6 py-4">Vencimiento</th>
                                        <th className="px-6 py-4 text-right">Monto</th>
                                        <th className="px-6 py-4">Estado</th>
                                        <th className="px-6 py-4 text-center">Archivo</th>
                                        <th className="px-6 py-4 text-center">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {isLoadingAccount ? (
                                        <tr>
                                            <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                                                Cargando documentos...
                                            </td>
                                        </tr>
                                    ) : filteredAccountDocs.length > 0 ? (
                                        filteredAccountDocs.map(doc => (
                                            <tr key={doc.id} className="hover:bg-slate-50">
                                                <td className="px-6 py-4 text-slate-600">
                                                    {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : '-'}
                                                </td>
                                                <td className="px-6 py-4 font-medium text-slate-900">{doc.invoice_number}</td>
                                                <td className="px-6 py-4 text-slate-600">{doc.type === 'FACTURA' ? 'Factura' : 'Nota Crédito'}</td>
                                                <td className="px-6 py-4 text-slate-600">
                                                    {doc.due_date ? new Date(doc.due_date).toLocaleDateString() : '-'}
                                                </td>
                                                <td className="px-6 py-4 text-right font-medium text-slate-900">
                                                    ${Number(doc.amount || 0).toLocaleString()}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="px-2 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                                                        {doc.status === 'PENDING' ? 'Pendiente' : doc.status === 'PAID' ? 'Pagada' : 'Anulada'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button
                                                        onClick={() => handleDownloadAccountDoc(doc.id)}
                                                        className="text-blue-600 hover:text-blue-800 font-medium text-xs"
                                                    >
                                                        Descargar
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button
                                                        onClick={() => handlePreviewAccountDoc(doc.id, `Documento ${doc.invoice_number}`)}
                                                        className="text-slate-600 hover:text-slate-800 font-medium text-xs mr-3"
                                                    >
                                                        Ver
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteAccountDoc(doc.id, doc.invoice_number)}
                                                        className="text-red-600 hover:text-red-800 font-medium text-xs"
                                                    >
                                                        Eliminar
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                                                No hay documentos registrados.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'ACCOUNT_AI' && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden overflow-x-auto touch-pan-x">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                    <tr>
                                        <th className="px-6 py-4">Fecha Proceso</th>
                                        <th className="px-6 py-4">N° Factura</th>
                                        <th className="px-6 py-4">Items</th>
                                        <th className="px-6 py-4 text-right">Neto</th>
                                        <th className="px-6 py-4 text-right">IVA</th>
                                        <th className="px-6 py-4 text-right">Total</th>
                                        <th className="px-6 py-4 text-center">Estado</th>
                                        <th className="px-6 py-4 text-center">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {isLoadingParsings ? (
                                        <tr>
                                            <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                                                Cargando recepciones inteligentes...
                                            </td>
                                        </tr>
                                    ) : invoiceParsings.length > 0 ? (
                                        invoiceParsings.map(parsing => (
                                            <tr key={parsing.id} className="hover:bg-slate-50">
                                                <td className="px-6 py-4 text-slate-600">
                                                    {parsing.created_at ? new Date(parsing.created_at).toLocaleDateString() + ' ' + new Date(parsing.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                                                </td>
                                                <td className="px-6 py-4 font-medium text-slate-900">{parsing.invoice_number}</td>
                                                <td className="px-6 py-4 text-slate-600">{parsing.parsed_items?.length || 0} items</td>
                                                <td className="px-6 py-4 text-right text-slate-600">
                                                    ${Number(parsing.net_amount || 0).toLocaleString()}
                                                </td>
                                                <td className="px-6 py-4 text-right text-slate-600">
                                                    ${Number(parsing.tax_amount || 0).toLocaleString()}
                                                </td>
                                                <td className="px-6 py-4 text-right font-medium text-slate-900">
                                                    ${Number(parsing.total_amount || 0).toLocaleString()}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-bold 
                                                        ${parsing.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                                            parsing.status === 'PARTIAL' ? 'bg-yellow-100 text-yellow-700' :
                                                                parsing.status === 'ERROR' ? 'bg-red-100 text-red-700' :
                                                                    'bg-blue-100 text-blue-700'}`}>
                                                        {parsing.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button
                                                        onClick={() => setSelectedParsing(parsing)}
                                                        className="text-blue-600 hover:text-blue-800 font-medium text-xs flex items-center justify-center gap-1 mx-auto"
                                                    >
                                                        <Eye size={14} /> Ver Detalle
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                                                No hay recepciones IA registradas.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'PRODUCTS' && (
                    <div className="space-y-6">
                        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div>
                                    <label className="text-xs font-semibold text-slate-500 uppercase">Desde</label>
                                    <input
                                        type="date"
                                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                        value={catalogFrom}
                                        onChange={(e) => setCatalogFrom(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-slate-500 uppercase">Hasta</label>
                                    <input
                                        type="date"
                                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                        value={catalogTo}
                                        onChange={(e) => setCatalogTo(e.target.value)}
                                    />
                                </div>
                            </div>
                            <button
                                onClick={() => setIsCatalogModalOpen(true)}
                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 text-sm font-medium"
                            >
                                <PlusIcon /> Subir Catálogo
                            </button>
                        </div>
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden overflow-x-auto touch-pan-x">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                    <tr>
                                        <th className="px-6 py-4">Fecha Carga</th>
                                        <th className="px-6 py-4">Archivo</th>
                                        <th className="px-6 py-4">Tipo</th>
                                        <th className="px-6 py-4 text-right">Tamaño</th>
                                        <th className="px-6 py-4 text-center">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {isLoadingCatalog ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                                                Cargando catálogos...
                                            </td>
                                        </tr>
                                    ) : filteredCatalogs.length > 0 ? (
                                        filteredCatalogs.map(file => (
                                            <tr key={file.id} className="hover:bg-slate-50">
                                                <td className="px-6 py-4 text-slate-600">
                                                    {file.uploaded_at ? new Date(file.uploaded_at).toLocaleDateString() : '-'}
                                                </td>
                                                <td className="px-6 py-4 font-medium text-slate-900">{file.file_name}</td>
                                                <td className="px-6 py-4 text-slate-600">{file.file_mime}</td>
                                                <td className="px-6 py-4 text-right text-slate-600">
                                                    {(file.file_size / 1024 / 1024).toFixed(2)} MB
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button
                                                        onClick={() => handlePreviewCatalog(file.id, 'Catálogo')}
                                                        className="text-slate-600 hover:text-slate-800 font-medium text-xs mr-3"
                                                    >
                                                        Ver
                                                    </button>
                                                    <button
                                                        onClick={() => handleDownloadCatalog(file.id)}
                                                        className="text-purple-600 hover:text-purple-800 font-medium text-xs"
                                                    >
                                                        Descargar
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteCatalog(file.id, file.file_name)}
                                                        className="text-red-600 hover:text-red-800 font-medium text-xs ml-3"
                                                    >
                                                        Eliminar
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                                                No hay catálogos cargados.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            <SupplierAccountUploadModal
                isOpen={isAccountModalOpen}
                supplierId={supplier.id}
                onClose={() => setIsAccountModalOpen(false)}
                onUploaded={() => fetchAccountDocs(supplier.id)}
            />
            <SupplierCatalogUploadModal
                isOpen={isCatalogModalOpen}
                supplierId={supplier.id}
                onClose={() => setIsCatalogModalOpen(false)}
                onUploaded={() => fetchCatalogs(supplier.id)}
            />
            <SupplierFilePreviewModal
                isOpen={isPreviewOpen}
                title={previewTitle}
                fileName={previewFileName}
                fileMime={previewFileMime}
                base64={previewBase64}
                onClose={() => setIsPreviewOpen(false)}
                onDownload={() => previewDownload?.()}
            />

            {/* Modal Detalle Parsing IA */}
            {selectedParsing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900">Detalle Factura N° {selectedParsing.invoice_number}</h3>
                                <p className="text-sm text-slate-500">Procesado el {new Date(selectedParsing.created_at).toLocaleString()}</p>
                            </div>
                            <button onClick={() => setSelectedParsing(null)} className="text-slate-400 hover:text-slate-600">
                                <span className="text-2xl">&times;</span>
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1">
                            {/* Resumen Cabecera */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 bg-slate-50 p-4 rounded-lg border border-slate-100">
                                <div>
                                    <p className="text-xs font-semibold text-slate-500 uppercase">Neto</p>
                                    <p className="text-lg font-bold text-slate-700">${Number(selectedParsing.net_amount || 0).toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-slate-500 uppercase">IVA</p>
                                    <p className="text-lg font-bold text-slate-700">${Number(selectedParsing.tax_amount || 0).toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-slate-500 uppercase">Total</p>
                                    <p className="text-lg font-bold text-blue-600">${Number(selectedParsing.total_amount || 0).toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-slate-500 uppercase">Items Detectados</p>
                                    <p className="text-lg font-bold text-slate-700">{selectedParsing.parsed_items?.length || 0}</p>
                                </div>
                            </div>

                            <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <Package size={18} className="text-blue-600" /> Detalle de Items
                            </h4>

                            <div className="border border-slate-200 rounded-lg overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-600 font-medium">
                                        <tr>
                                            <th className="px-4 py-3">Descripción</th>
                                            <th className="px-4 py-3 text-right">Cant.</th>
                                            <th className="px-4 py-3 text-right">P. Unitario</th>
                                            <th className="px-4 py-3 text-right">Total</th>
                                            <th className="px-4 py-3">SKU Prov.</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {(selectedParsing.parsed_items || []).map((item: any, idx: number) => (
                                            <tr key={idx} className="hover:bg-slate-50">
                                                <td className="px-4 py-3 font-medium text-slate-800">{item.description}</td>
                                                <td className="px-4 py-3 text-right text-slate-600">{item.quantity}</td>
                                                <td className="px-4 py-3 text-right text-slate-600">${Number(item.unit_cost || 0).toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right font-medium text-slate-900">${Number(item.total_amount || 0).toLocaleString()}</td>
                                                <td className="px-4 py-3 text-slate-500 text-xs font-mono">{item.supplier_sku || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end">
                            <button
                                onClick={() => setSelectedParsing(null)}
                                className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium text-sm shadow-sm"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}


        </div>
    );
};

const PlusIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
);
