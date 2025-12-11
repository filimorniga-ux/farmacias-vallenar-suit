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

    // Effect to populate data
    React.useEffect(() => {
        if (isOpen && supplierToEdit) {
            setRut(supplierToEdit.rut);
            setBusinessName(supplierToEdit.business_name);
            setFantasyName(supplierToEdit.fantasy_name);
            setSector(supplierToEdit.sector);
            setWebsite(supplierToEdit.website || '');

            setAddress(supplierToEdit.address);
            setRegion(supplierToEdit.region);
            setCity(supplierToEdit.city);
            setCommune(supplierToEdit.commune);
            setPhone1(supplierToEdit.phone_1);
            setPhone2(supplierToEdit.phone_2 || '');
            setEmailOrders(supplierToEdit.email_orders);
            setEmailBilling(supplierToEdit.email_billing);
            setContactEmail(supplierToEdit.contact_email);
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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-2 rounded-lg">
                            <Building2 className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">{supplierToEdit ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h2>
                            <p className="text-blue-100 text-sm">{supplierToEdit ? 'Actualizar Ficha Técnica' : 'Alta Maestra de Socio Comercial'}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-white/80 hover:text-white transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Section 1: Company Data */}
                    <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-6 border border-blue-200">
                        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <Building2 className="w-5 h-5 text-blue-600" />
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Location & Contact */}
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
                        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-green-600" />
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 3: Banking */}
                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-200">
                        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <CreditCard className="w-5 h-5 text-purple-600" />
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 4: Brands & Portfolio */}
                    <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl p-6 border border-orange-200">
                        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <Tag className="w-5 h-5 text-orange-600" />
                            D. Marcas & Portafolio
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    Agregar Marcas
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={brandInput}
                                        onChange={(e) => setBrandInput(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder="Escribe una marca y presiona Enter o Espacio"
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddBrand}
                                        className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center gap-2"
                                    >
                                        <Plus className="w-4 h-4" />
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
                                            <Tag className="w-3 h-3" />
                                            {brand}
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveBrand(brand)}
                                                className="hover:text-orange-900"
                                            >
                                                <Trash2 className="w-3 h-3" />
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
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
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
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </form>

                {/* Footer */}
                <div className="bg-gray-50 px-6 py-4 flex justify-between items-center border-t border-gray-200">
                    <p className="text-sm text-gray-600">
                        <span className="text-red-500">*</span> Campos obligatorios
                    </p>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 font-medium"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSubmit}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-lg shadow-blue-200"
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
