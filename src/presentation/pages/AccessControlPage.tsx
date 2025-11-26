import React, { useState } from 'react';
import { User, Clock, Coffee, LogOut, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';

// Mock Employees for Attendance Wall
const EMPLOYEES = [
    { id: '1', name: 'Juan Pérez', role: 'QF', avatar: 'JP' },
    { id: '2', name: 'María González', role: 'Caja', avatar: 'MG' },
    { id: '3', name: 'Carlos Boss', role: 'Admin', avatar: 'CB' },
    { id: '4', name: 'Ana Roja', role: 'Bodega', avatar: 'AR' },
];

const AccessControlPage: React.FC = () => {
    const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
    const [pin, setPin] = useState('');
    const [status, setStatus] = useState<'IDLE' | 'SUCCESS'>('IDLE');
    const [actionType, setActionType] = useState('');

    const handlePinSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Mock validation
        if (pin.length === 4) {
            setStatus('SUCCESS');
            setTimeout(() => {
                setStatus('IDLE');
                setSelectedEmployee(null);
                setPin('');
                setActionType('');
            }, 3000);
        }
    };

    const handleAction = (type: string) => {
        setActionType(type);
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-8">
            <div className="w-full max-w-5xl">
                <header className="text-center mb-12">
                    <h1 className="text-4xl font-extrabold text-white mb-2">Control de Asistencia</h1>
                    <p className="text-slate-400 text-xl">{new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                    <p className="text-cyan-400 text-3xl font-mono font-bold mt-2">
                        {new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                </header>

                {!selectedEmployee ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        {EMPLOYEES.map(emp => (
                            <motion.button
                                key={emp.id}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setSelectedEmployee(emp)}
                                className="bg-slate-800 rounded-3xl p-8 flex flex-col items-center gap-4 hover:bg-slate-700 transition border border-slate-700 hover:border-cyan-500 group"
                            >
                                <div className="w-24 h-24 rounded-full bg-slate-600 flex items-center justify-center text-2xl font-bold text-white group-hover:bg-cyan-600 transition-colors">
                                    {emp.avatar}
                                </div>
                                <div className="text-center">
                                    <h3 className="text-xl font-bold text-white">{emp.name}</h3>
                                    <p className="text-slate-400">{emp.role}</p>
                                </div>
                            </motion.button>
                        ))}
                    </div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white rounded-[3rem] p-12 max-w-2xl mx-auto shadow-2xl"
                    >
                        {status === 'SUCCESS' ? (
                            <div className="text-center py-12">
                                <CheckCircle size={80} className="text-emerald-500 mx-auto mb-6" />
                                <h2 className="text-3xl font-bold text-slate-900 mb-2">¡Marca Registrada!</h2>
                                <p className="text-xl text-slate-500">Hola {selectedEmployee.name}, que tengas un buen turno.</p>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center gap-6 mb-8 pb-8 border-b border-slate-100">
                                    <div className="w-20 h-20 rounded-full bg-cyan-600 flex items-center justify-center text-2xl font-bold text-white">
                                        {selectedEmployee.avatar}
                                    </div>
                                    <div>
                                        <h2 className="text-3xl font-bold text-slate-900">{selectedEmployee.name}</h2>
                                        <button onClick={() => setSelectedEmployee(null)} className="text-slate-400 hover:text-slate-600 font-medium">
                                            Cambiar Usuario
                                        </button>
                                    </div>
                                </div>

                                {!actionType ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        <button onClick={() => handleAction('IN')} className="p-6 bg-emerald-50 rounded-2xl border-2 border-emerald-100 hover:border-emerald-500 flex flex-col items-center gap-2 transition">
                                            <Clock size={32} className="text-emerald-600" />
                                            <span className="font-bold text-emerald-800">ENTRADA</span>
                                        </button>
                                        <button onClick={() => handleAction('OUT')} className="p-6 bg-red-50 rounded-2xl border-2 border-red-100 hover:border-red-500 flex flex-col items-center gap-2 transition">
                                            <LogOut size={32} className="text-red-600" />
                                            <span className="font-bold text-red-800">SALIDA</span>
                                        </button>
                                        <button onClick={() => handleAction('BREAK')} className="col-span-2 p-6 bg-orange-50 rounded-2xl border-2 border-orange-100 hover:border-orange-500 flex flex-col items-center gap-2 transition">
                                            <Coffee size={32} className="text-orange-600" />
                                            <span className="font-bold text-orange-800">COLACIÓN</span>
                                        </button>
                                    </div>
                                ) : (
                                    <form onSubmit={handlePinSubmit}>
                                        <h3 className="text-center text-xl font-bold text-slate-700 mb-6">Ingrese su PIN para confirmar</h3>
                                        <input
                                            type="password"
                                            maxLength={4}
                                            autoFocus
                                            className="w-full text-center text-5xl tracking-[1em] font-bold py-6 border-b-4 border-slate-200 focus:border-cyan-600 focus:outline-none mb-8"
                                            value={pin}
                                            onChange={(e) => setPin(e.target.value)}
                                        />
                                        <div className="grid grid-cols-2 gap-4">
                                            <button type="button" onClick={() => setActionType('')} className="py-4 rounded-xl font-bold text-slate-500 bg-slate-100">
                                                Volver
                                            </button>
                                            <button type="submit" className="py-4 rounded-xl font-bold text-white bg-cyan-600 hover:bg-cyan-700 shadow-lg">
                                                Confirmar
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </>
                        )}
                    </motion.div>
                )}
            </div>
        </div>
    );
};

export default AccessControlPage;
