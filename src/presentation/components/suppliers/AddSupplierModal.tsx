import React, { useState } from 'react';
import { X, Building2, MapPin, Phone, Mail, CreditCard, Tag, Plus, Trash2 } from 'lucide-react';
import { Supplier, BankAccount } from '../../../domain/types';
import { toast } from 'sonner';

interface AddSupplierModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (supplier: any) => void;
    supplierToEdit?: Supplier | null;
}

const CHILEAN_BANKS = [
    'Banco Estado',
    'Banco de Chile',
    'Banco Santander',
    'Banco BCI',
    'Banco Scotiabank',
    'Banco Itaú',
    'Banco Security',
    'Banco Falabella',
    'Banco Ripley',
    'Banco Consorcio'
];

const CHILEAN_REGIONS = [
    'Región de Arica y Parinacota',
    'Región de Tarapacá',
    'Región de Antofagasta',
    'Región de Atacama',
    'Región de Coquimbo',
    'Región de Valparaíso',
    'Región Metropolitana',
    'Región del Libertador General Bernardo O\'Higgins',
    'Región del Maule',
    'Región de Ñuble',
    'Región del Biobío',
    'Región de La Araucanía',
    'Región de Los Ríos',
    'Región de Los Lagos',
    'Región de Aysén',
    'Región de Magallanes'
];

const SECTORS = [
    'Laboratorio Farmacéutico',
    'Distribuidora Mayorista',
    'Insumos Médicos',
    'Retail y Belleza',
    'Servicios Logísticos',
    'Equipamiento Médico'
];

const AddSupplierModal: React.FC<AddSupplierModalProps> = ({ isOpen, onClose, onSave, supplierToEdit }) => {
    // Section 1: Company Data
    const [rut, setRut] = useState('');
    const [businessName, setBusinessName] = useState('');
    const [fantasyName, setFantasyName] = useState('');
    const [sector, setSector] = useState('');
    const [website, setWebsite] = useState('');

    // Section 2: Location & Contact
    const [address, setAddress] = useState('');
    const [region, setRegion] = useState('');
    const [city, setCity] = useState('');
    const [commune, setCommune] = useState('');
    const [phone1, setPhone1] = useState('');
    const [phone2, setPhone2] = useState('');
    const [emailOrders, setEmailOrders] = useState('');
    const [emailBilling, setEmailBilling] = useState('');
    const [contactEmail, setContactEmail] = useState('');
    const [contactName, setContactName] = useState(''); // New Field

    // Section 3: Banking
    const [bankName, setBankName] = useState('');
    const [accountType, setAccountType] = useState<'VISTA' | 'CORRIENTE' | 'AHORRO'>('CORRIENTE');
    const [accountNumber, setAccountNumber] = useState('');
    const [rutHolder, setRutHolder] = useState('');

    // Section 4: Brands & Portfolio
    const [brandInput, setBrandInput] = useState('');
    const [brands, setBrands] = useState<string[]>([]);

    // Additional fields
    const [paymentTerms, setPaymentTerms] = useState<'CONTADO' | '30_DIAS' | '60_DIAS' | '90_DIAS'>('30_DIAS');
    const [leadTimeDays, setLeadTimeDays] = useState(7);

    const handleReset = () => {
        setRut('');
        setBusinessName('');
        setFantasyName('');
        setSector('');
        setWebsite('');
        setAddress('');
        setRegion('');
        setCity('');
        setCommune('');
        setPhone1('');
        setPhone2('');
        setEmailOrders('');
        setEmailBilling('');
        setContactEmail('');
        setContactName('');
        setBankName('');
        setAccountType('CORRIENTE');
        setAccountNumber('');
        setRutHolder('');
        setBrands([]);
        setBrandInput('');
        setPaymentTerms('30_DIAS');
        setLeadTimeDays(7);
    };

    // Effect to populate data
    React.useEffect(() => {
        if (isOpen && supplierToEdit) {
            setRut(supplierToEdit.rut || '');
            setBusinessName(supplierToEdit.business_name || '');
            setFantasyName(supplierToEdit.fantasy_name || '');
            setSector(supplierToEdit.sector || '');
            setWebsite(supplierToEdit.website || '');

            setAddress(supplierToEdit.address || '');
            setRegion(supplierToEdit.region || '');
            setCity(supplierToEdit.city || '');
            setCommune(supplierToEdit.commune || '');
            setPhone1(supplierToEdit.phone_1 || '');
            setPhone2(supplierToEdit.phone_2 || '');
            setEmailOrders(supplierToEdit.email_orders || '');
            setEmailBilling(supplierToEdit.email_billing || '');
            setContactEmail(supplierToEdit.contact_email || '');
            setContactName(supplierToEdit.contacts?.[0]?.name || '');

            if (supplierToEdit.bank_account) {
                setBankName(supplierToEdit.bank_account.bank);
                setAccountType(supplierToEdit.bank_account.account_type as any);
                setAccountNumber(supplierToEdit.bank_account.account_number);
                setRutHolder(supplierToEdit.bank_account.rut_holder || '');
            } else {
                setBankName('');
                setAccountNumber('');
                setRutHolder('');
            }

            setBrands(supplierToEdit.brands || []);
            setPaymentTerms(supplierToEdit.payment_terms as any);
            setLeadTimeDays(supplierToEdit.lead_time_days);
        } else if (isOpen && !supplierToEdit) {
            handleReset();
        }
    }, [isOpen, supplierToEdit]);

    const handleAddBrand = () => {
        const trimmed = brandInput.trim();
        if (trimmed && !brands.includes(trimmed)) {
            setBrands([...brands, trimmed]);
            setBrandInput('');
        }
    };

    const handleRemoveBrand = (brand: string) => {
        setBrands(brands.filter(b => b !== brand));
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleAddBrand();
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        if (!rut || !businessName || !fantasyName || !sector) {
            toast.error('Por favor completa los campos obligatorios de Datos Empresa');
            return;
        }

        if (!address || !region || !city || !emailOrders || !emailBilling || !phone1) {
            toast.error('Por favor completa los campos obligatorios de Ubicación & Contacto');
            return;
        }

        const bankAccount: BankAccount | undefined = bankName && accountNumber ? {
            bank: bankName,
            account_type: accountType,
            account_number: accountNumber,
            email_notification: emailBilling,
            rut_holder: rutHolder || rut
        } : undefined;

        const supplierData: Omit<Supplier, 'id'> = {
            rut,
            business_name: businessName,
            fantasy_name: fantasyName,
            website,
            address,
            region,
            city,
            commune,
            phone_1: phone1,
            phone_2: phone2,
            contact_email: contactEmail || emailOrders,
            email_orders: emailOrders,
            email_billing: emailBilling,
            contacts: [{ name: contactName, email: contactEmail, phone: phone1, role: 'Vendedor', is_primary: true }],
            sector,
            brands,
            categories: [],
            payment_terms: paymentTerms,
            rating: 3,
            lead_time_days: leadTimeDays,
            bank_account: bankAccount
        };

        onSave(supplierData);
        handleReset();
        onClose();
    };



    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-2 [padding-bottom:max(env(safe-area-inset-bottom),0.5rem)] [padding-top:max(env(safe-area-inset-top),0.5rem)] sm:items-center sm:px-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-supplier-modal-title"
                className="flex h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[90vh]"
            >
                {/* Header */}
                <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-4 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="shrink-0 rounded-lg bg-white/20 p-2">
                            <Building2 className="h-6 w-6 text-white" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                            <h2 id="add-supplier-modal-title" className="truncate text-lg font-bold text-white sm:text-xl">{supplierToEdit ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h2>
                            <p className="truncate text-sm text-blue-100">{supplierToEdit ? 'Actualizar Ficha Técnica' : 'Alta Maestra de Socio Comercial'}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Cerrar formulario de proveedor"
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                        <X className="h-6 w-6" aria-hidden="true" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex-1 space-y-6 overflow-y-auto overscroll-contain p-4 sm:p-6">
                    {/* Section 1: Company Data */}
                    <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 p-4 sm:p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <Building2 className="h-5 w-5 text-blue-600" aria-hidden="true" />
                            A. Datos de la Empresa
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    RUT <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={rut}
                                    onChange={(e) => setRut(e.target.value)}
                                    placeholder="12.345.678-9"
                                    className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    Razón Social <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={businessName}
                                    onChange={(e) => setBusinessName(e.target.value)}
                                    placeholder="Laboratorios Chile S.A."
                                    className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    Nombre Fantasía <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={fantasyName}
                                    onChange={(e) => setFantasyName(e.target.value)}
                                    placeholder="Lab Chile"
                                    className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    Rubro/Sector <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={sector}
                                    onChange={(e) => setSector(e.target.value)}
                                    className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                                    required
                                >
                                    <option value="">Seleccionar...</option>
                                    {SECTORS.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    Sitio Web
                                </label>
                                <input
                                    type="url"
                                    value={website}
                                    onChange={(e) => setWebsite(e.target.value)}
                                    placeholder="https://www.ejemplo.cl"
                                    className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Location & Contact */}
                    <div className="rounded-xl border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 p-4 sm:p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <MapPin className="h-5 w-5 text-green-600" aria-hidden="true" />
                            B. Ubicación & Contacto
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    Dirección <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                    placeholder="Av. Libertador Bernardo O'Higgins 1234"
                                    className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-green-500 sm:text-sm"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    Región <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={region}
                                    onChange={(e) => setRegion(e.target.value)}
                                    className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-green-500 sm:text-sm"
                                    required
                                >
                                    <option value="">Seleccionar...</option>
                                    {CHILEAN_REGIONS.map(r => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    Ciudad <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={city}
                                    onChange={(e) => setCity(e.target.value)}
                                    placeholder="Santiago"
                                    className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-green-500 sm:text-sm"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    Comuna
                                </label>
                                <input
                                    type="text"
                                    value={commune}
                                    onChange={(e) => setCommune(e.target.value)}
                                    placeholder="Providencia"
                                    className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-green-500 sm:text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    Teléfono Principal <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="tel"
                                    value={phone1}
                                    onChange={(e) => setPhone1(e.target.value)}
                                    placeholder="+56 2 2345 6789"
                                    className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-green-500 sm:text-sm"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    Teléfono Secundario
                                </label>
                                <input
                                    type="tel"
                                    value={phone2}
                                    onChange={(e) => setPhone2(e.target.value)}
                                    placeholder="+56 9 8765 4321"
                                    className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-green-500 sm:text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    Nombre Contacto / Vendedor
                                </label>
                                <input
                                    type="text"
                                    value={contactName}
                                    onChange={(e) => setContactName(e.target.value)}
                                    placeholder="Juan Pérez"
                                    className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-green-500 sm:text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    Email Pedidos/O.C. <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="email"
                                    value={emailOrders}
                                    onChange={(e) => setEmailOrders(e.target.value)}
                                    placeholder="pedidos@proveedor.cl"
                                    className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-green-500 sm:text-sm"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    Email Facturación/Cobranza <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="email"
                                    value={emailBilling}
                                    onChange={(e) => setEmailBilling(e.target.value)}
                                    placeholder="cobranza@proveedor.cl"
                                    className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-green-500 sm:text-sm"
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 3: Banking */}
                    <div className="rounded-xl border border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50 p-4 sm:p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <CreditCard className="h-5 w-5 text-purple-600" aria-hidden="true" />
                            C. Datos Bancarios (Para Transferencias)
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    Banco
                                </label>
                                <select
                                    value={bankName}
                                    onChange={(e) => setBankName(e.target.value)}
                                    className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-purple-500 sm:text-sm"
                                >
                                    <option value="">Seleccionar...</option>
                                    {CHILEAN_BANKS.map(bank => (
                                        <option key={bank} value={bank}>{bank}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    Tipo de Cuenta
                                </label>
                                <select
                                    value={accountType}
                                    onChange={(e) => setAccountType(e.target.value as any)}
                                    className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-purple-500 sm:text-sm"
                                >
                                    <option value="CORRIENTE">Cuenta Corriente</option>
                                    <option value="VISTA">Cuenta Vista</option>
                                    <option value="AHORRO">Cuenta de Ahorro</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    Número de Cuenta
                                </label>
                                <input
                                    type="text"
                                    value={accountNumber}
                                    onChange={(e) => setAccountNumber(e.target.value)}
                                    placeholder="1234567890"
                                    className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-purple-500 sm:text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    RUT Titular (si difiere)
                                </label>
                                <input
                                    type="text"
                                    value={rutHolder}
                                    onChange={(e) => setRutHolder(e.target.value)}
                                    placeholder="11.111.111-1"
                                    className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-purple-500 sm:text-sm"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 4: Brands & Portfolio */}
                    <div className="rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 p-4 sm:p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <Tag className="h-5 w-5 text-orange-600" aria-hidden="true" />
                            D. Marcas & Portafolio
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    Agregar Marcas
                                </label>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <input
                                        type="text"
                                        value={brandInput}
                                        onChange={(e) => setBrandInput(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder="Escribe una marca y presiona Enter o Espacio"
                                        className="min-h-11 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-orange-500 sm:text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddBrand}
                                        className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-white hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                                    >
                                        <Plus className="h-4 w-4" aria-hidden="true" />
                                        Agregar
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Presiona Enter o Espacio para agregar cada marca
                                </p>
                            </div>

                            {/* Brands Chips */}
                            {brands.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {brands.map((brand, idx) => (
                                        <div
                                            key={idx}
                                            className="bg-orange-100 text-orange-800 px-3 py-1.5 rounded-full flex items-center gap-2 text-sm font-medium"
                                        >
                                            <Tag className="h-3 w-3" aria-hidden="true" />
                                            {brand}
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveBrand(brand)}
                                                aria-label={`Eliminar marca ${brand}`}
                                                className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full hover:bg-orange-200 hover:text-orange-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                                            >
                                                <Trash2 className="h-3 w-3" aria-hidden="true" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Commercial Terms */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-orange-200">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">
                                        Condiciones de Pago
                                    </label>
                                    <select
                                        value={paymentTerms}
                                        onChange={(e) => setPaymentTerms(e.target.value as any)}
                                        className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-orange-500 sm:text-sm"
                                    >
                                        <option value="CONTADO">Contado</option>
                                        <option value="30_DIAS">30 Días</option>
                                        <option value="60_DIAS">60 Días</option>
                                        <option value="90_DIAS">90 Días</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">
                                        Tiempo de Entrega (días)
                                    </label>
                                    <input
                                        type="number"
                                        value={leadTimeDays}
                                        onChange={(e) => setLeadTimeDays(parseInt(e.target.value) || 0)}
                                        min="1"
                                        className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-orange-500 sm:text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </form>

                {/* Footer */}
                <div className="flex shrink-0 flex-col gap-3 border-t border-gray-200 bg-gray-50 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <p className="text-sm text-gray-600">
                        <span className="text-red-500">*</span> Campos obligatorios
                    </p>
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                            type="button"
                            onClick={onClose}
                            className="min-h-11 rounded-lg border border-gray-300 px-6 py-2 font-medium text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            className="min-h-11 rounded-lg bg-blue-600 px-6 py-2 font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                        >
                            Guardar Proveedor
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AddSupplierModal;
