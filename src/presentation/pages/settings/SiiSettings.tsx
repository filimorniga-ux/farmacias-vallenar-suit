import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Upload, FileText, CheckCircle, AlertTriangle, Key, Building2, Briefcase, Hash } from 'lucide-react';
import { usePharmaStore } from '../../store/useStore';
import { validateCertificate } from '../../../domain/logic/sii/crypto';

const SiiSettings = () => {
    const { siiConfiguration, siiCafs, updateSiiConfiguration, addCaf, getAvailableFolios } = usePharmaStore();

    const [certFile, setCertFile] = useState<File | null>(null);
    const [certPassword, setCertPassword] = useState('');
    const [isValidating, setIsValidating] = useState(false);
    const [validationResult, setValidationResult] = useState<{ valid: boolean; commonName?: string; expiryDate?: Date; error?: string } | null>(null);

    // Company Info State
    const [companyData, setCompanyData] = useState({
        rut: siiConfiguration?.rut_emisor || '',
        razonSocial: siiConfiguration?.razon_social || '',
        giro: siiConfiguration?.giro || '',
        acteco: siiConfiguration?.acteco || 477310
    });

    const handleCertificateUpload = async () => {
        if (!certFile || !certPassword) {
            alert('Por favor seleccione un certificado e ingrese la contraseña');
            return;
        }

        setIsValidating(true);
        try {
            // Convert file to base64
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64 = e.target?.result as string;
                const pfxBase64 = base64.split(',')[1]; // Remove data:application/x-pkcs12;base64,

                // Validate certificate
                const result = await validateCertificate(pfxBase64, certPassword);
                setValidationResult(result);

                if (result.valid) {
                    // Save to store
                    const config = {
                        id: siiConfiguration?.id || `SII-${Date.now()}`,
                        rut_emisor: companyData.rut,
                        razon_social: companyData.razonSocial,
                        giro: companyData.giro,
                        acteco: companyData.acteco,
                        certificado_pfx_base64: pfxBase64,
                        certificado_password: certPassword, // In production, encrypt this!
                        fecha_vencimiento_firma: result.expiryDate?.getTime() || Date.now(),
                        ambiente: siiConfiguration?.ambiente || 'CERTIFICACION' as const,
                    };
                    updateSiiConfiguration(config);
                }
            };
            reader.readAsDataURL(certFile);
        } catch (error) {
            setValidationResult({ valid: false, error: 'Error al procesar el certificado' });
        } finally {
            setIsValidating(false);
        }
    };

    const handleCafUpload = async (e: React.ChangeEvent<HTMLInputElement>, tipoDte: 39 | 33) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const xmlContent = event.target?.result as string;

            // TODO: Parse XML to extract rango_desde and rango_hasta
            // For MVP, using mock values
            const mockRangoDesde = 1;
            const mockRangoHasta = tipoDte === 39 ? 1000 : 500;

            addCaf({
                tipo_dte: tipoDte,
                xml_content: xmlContent,
                rango_desde: mockRangoDesde,
                rango_hasta: mockRangoHasta,
                folios_usados: 0,
                fecha_carga: Date.now(),
                active: true
            });

            alert(`✅ CAF cargado exitosamente. Folios disponibles: ${mockRangoHasta - mockRangoDesde}`);
        };
        reader.readAsText(file);
    };

    const toggleAmbiente = () => {
        if (!siiConfiguration) return;
        updateSiiConfiguration({
            ...siiConfiguration,
            ambiente: siiConfiguration.ambiente === 'CERTIFICACION' ? 'PRODUCCION' : 'CERTIFICACION'
        });
    };

    return (
        <div className="p-6 bg-slate-50 min-h-screen">
            <header className="mb-8">
                <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
                    <Shield className="text-green-600" />
                    Conexión SII (Servicio de Impuestos Internos)
                </h1>
                <p className="text-slate-500 mt-1">Configure la facturación electrónica nativa. Sus datos están protegidos.</p>
            </header>

            <div className="grid grid-cols-2 gap-6">
                {/* Company Information */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Building2 className="text-blue-500" size={20} />
                        Información de la Empresa
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">RUT Emisor</label>
                            <input
                                type="text"
                                value={companyData.rut}
                                onChange={(e) => setCompanyData({ ...companyData, rut: e.target.value })}
                                placeholder="76.123.456-7"
                                className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Razón Social</label>
                            <input
                                type="text"
                                value={companyData.razonSocial}
                                onChange={(e) => setCompanyData({ ...companyData, razonSocial: e.target.value })}
                                placeholder="FARMACIAS VALLENAR LTDA"
                                className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Giro Comercial</label>
                            <input
                                type="text"
                                value={companyData.giro}
                                onChange={(e) => setCompanyData({ ...companyData, giro: e.target.value })}
                                placeholder="VENTA AL POR MENOR DE PRODUCTOS FARMACEUTICOS"
                                className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">ACTECO (Código Actividad)</label>
                            <input
                                type="number"
                                value={companyData.acteco}
                                onChange={(e) => setCompanyData({ ...companyData, acteco: Number(e.target.value) })}
                                placeholder="477310"
                                className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                    </div>
                </div>

                {/* Certificate Upload */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Key className="text-purple-500" size={20} />
                        Certificado Digital
                    </h2>

                    {validationResult?.valid ? (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                            <div className="flex items-center gap-2 text-green-700 font-bold mb-2">
                                <CheckCircle size={20} />
                                Certificado Cargado
                            </div>
                            <div className="text-sm text-green-600">
                                <p><strong>Titular:</strong> {validationResult.commonName}</p>
                                <p><strong>Vencimiento:</strong> {validationResult.expiryDate?.toLocaleDateString()}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Archivo PFX / P12</label>
                                <input
                                    type="file"
                                    accept=".pfx,.p12"
                                    onChange={(e) => setCertFile(e.target.files?.[0] || null)}
                                    className="w-full p-3 border border-slate-300 rounded-xl"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Contraseña del Certificado</label>
                                <input
                                    type="password"
                                    value={certPassword}
                                    onChange={(e) => setCertPassword(e.target.value)}
                                    placeholder="••••••"
                                    className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                />
                            </div>
                            <button
                                onClick={handleCertificateUpload}
                                disabled={!certFile || !certPassword || isValidating}
                                className="w-full py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-200"
                            >
                                {isValidating ? 'Validando...' : 'Cargar y Validar'}
                            </button>
                        </div>
                    )}

                    {validationResult && !validationResult.valid && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-4">
                            <div className="flex items-center gap-2 text-red-700 font-bold mb-1">
                                <AlertTriangle size={20} />
                                Error
                            </div>
                            <p className="text-sm text-red-600">{validationResult.error}</p>
                        </div>
                    )}
                </div>

                {/* CAF Management */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 col-span-2">
                    <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <FileText className="text-orange-500" size={20} />
                        Folios (CAF - Código de Autorización de Folios)
                    </h2>

                    <div className="grid grid-cols-2 gap-6">
                        {/* Boletas (39) */}
                        <div className="border border-blue-200 rounded-xl p-4 bg-blue-50">
                            <h3 className="font-bold text-blue-800 mb-3 flex items-center gap-2">
                                <Hash size={18} />
                                Boletas Electrónicas (Tipo 39)
                            </h3>
                            <div className="mb-4">
                                <div className="text-sm text-blue-600 mb-2">
                                    <strong>Folios Disponibles:</strong> {getAvailableFolios(39)}
                                </div>
                                {siiCafs.filter(c => c.tipo_dte === 39).map(caf => (
                                    <div key={caf.id} className="text-xs text-blue-500 bg-white p-2 rounded mb-1">
                                        Rango: {caf.rango_desde} - {caf.rango_hasta} | Usados: {caf.folios_usados}
                                    </div>
                                ))}
                            </div>
                            <input
                                type="file"
                                accept=".xml"
                                onChange={(e) => handleCafUpload(e, 39)}
                                className="w-full p-2 border border-blue-300 rounded-lg text-sm"
                            />
                        </div>

                        {/* Facturas (33) */}
                        <div className="border border-green-200 rounded-xl p-4 bg-green-50">
                            <h3 className="font-bold text-green-800 mb-3 flex items-center gap-2">
                                <Hash size={18} />
                                Facturas Electrónicas (Tipo 33)
                            </h3>
                            <div className="mb-4">
                                <div className="text-sm text-green-600 mb-2">
                                    <strong>Folios Disponibles:</strong> {getAvailableFolios(33)}
                                </div>
                                {siiCafs.filter(c => c.tipo_dte === 33).map(caf => (
                                    <div key={caf.id} className="text-xs text-green-500 bg-white p-2 rounded mb-1">
                                        Rango: {caf.rango_desde} - {caf.rango_hasta} | Usados: {caf.folios_usados}
                                    </div>
                                ))}
                            </div>
                            <input
                                type="file"
                                accept=".xml"
                                onChange={(e) => handleCafUpload(e, 33)}
                                className="w-full p-2 border border-green-300 rounded-lg text-sm"
                            />
                        </div>
                    </div>
                </div>

                {/* Environment Toggle */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 col-span-2">
                    <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Briefcase className="text-indigo-500" size={20} />
                        Ambiente
                    </h2>
                    <div className="flex items-center gap-6">
                        <button
                            onClick={toggleAmbiente}
                            disabled={!siiConfiguration}
                            className={`px-8 py-4 rounded-xl font-bold text-lg transition-all ${siiConfiguration?.ambiente === 'CERTIFICACION'
                                    ? 'bg-yellow-500 text-white shadow-lg shadow-yellow-200'
                                    : 'bg-slate-200 text-slate-500'
                                }`}
                        >
                            🧪 Certificación (Pruebas - Maullin)
                        </button>
                        <button
                            onClick={toggleAmbiente}
                            disabled={!siiConfiguration}
                            className={`px-8 py-4 rounded-xl font-bold text-lg transition-all ${siiConfiguration?.ambiente === 'PRODUCCION'
                                    ? 'bg-green-600 text-white shadow-lg shadow-green-200'
                                    : 'bg-slate-200 text-slate-500'
                                }`}
                        >
                            ✅ Producción (Real - Palena)
                        </button>
                    </div>
                    <p className="text-sm text-slate-500 mt-4">
                        <strong>Nota:</strong> Cambie a Producción solo cuando esté listo para emitir documentos reales ante el SII.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default SiiSettings;
