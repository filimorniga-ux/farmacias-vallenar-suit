import React from 'react';
import { usePharmaStore } from '../../store/useStore';
import { Printer, Save, FileText, Receipt } from 'lucide-react';
import { motion } from 'framer-motion';

const PrinterSettings: React.FC = () => {
    const { printerConfig, updatePrinterConfig } = usePharmaStore();

    const handleChange = (key: keyof typeof printerConfig, value: any) => {
        updatePrinterConfig({ [key]: value });
    };

    return (
        <div className="max-w-4xl mx-auto p-6">
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
                    <Printer className="text-cyan-600" size={32} />
                    Configuración de Impresión
                </h1>
                <p className="text-slate-500 mt-2">Gestiona la automatización de tickets y comprobantes.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Automatización */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"
                >
                    <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <Receipt size={20} className="text-cyan-500" />
                        Automatización
                    </h2>

                    <div className="space-y-6">
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                            <div>
                                <h3 className="font-bold text-slate-700">Auto-Imprimir Ventas</h3>
                                <p className="text-sm text-slate-500">Imprimir boleta al finalizar venta en POS</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={printerConfig.auto_print_sale}
                                    onChange={(e) => handleChange('auto_print_sale', e.target.checked)}
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
                            </label>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                            <div>
                                <h3 className="font-bold text-slate-700">Auto-Imprimir Caja</h3>
                                <p className="text-sm text-slate-500">Comprobantes de Gastos y Retiros</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={printerConfig.auto_print_cash}
                                    onChange={(e) => handleChange('auto_print_cash', e.target.checked)}
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
                            </label>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                            <div>
                                <h3 className="font-bold text-slate-700">Auto-Imprimir Turnos</h3>
                                <p className="text-sm text-slate-500">Tickets de atención en Kioscos</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={printerConfig.auto_print_queue}
                                    onChange={(e) => handleChange('auto_print_queue', e.target.checked)}
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
                            </label>
                        </div>
                    </div>
                </motion.div>

                {/* Personalización */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"
                >
                    <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <FileText size={20} className="text-purple-500" />
                        Personalización del Ticket
                    </h2>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Encabezado (Razón Social / Fantasía)</label>
                            <input
                                type="text"
                                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition"
                                value={printerConfig.header_text}
                                onChange={(e) => handleChange('header_text', e.target.value)}
                                placeholder="Ej: FARMACIAS VALLENAR"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Pie de Página (Mensaje)</label>
                            <textarea
                                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition h-32 resize-none"
                                value={printerConfig.footer_text}
                                onChange={(e) => handleChange('footer_text', e.target.value)}
                                placeholder="Ej: Gracias por su preferencia..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">IP Impresora (Red)</label>
                            <input
                                type="text"
                                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition font-mono text-sm"
                                value={printerConfig.printer_ip || ''}
                                onChange={(e) => handleChange('printer_ip', e.target.value)}
                                placeholder="192.168.1.200"
                            />
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default PrinterSettings;
