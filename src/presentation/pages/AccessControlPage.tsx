
'use client';
import React, { useState } from 'react';
import { Clock, LogIn, LogOut, Coffee } from 'lucide-react';
import { usePharmaStore } from '../store/useStore';

const EMPLOYEE_PINS = {
    '1234': 'u1',
    '5555': 'u2',
};

const AccessControlPage: React.FC = () => {
    const { employees, markAttendance } = usePharmaStore();
    const [pin, setPin] = useState('');
    const [message, setMessage] = useState('');

    const handlePinEntry = (type: 'IN' | 'OUT' | 'BREAK') => {
        const employeeId = EMPLOYEE_PINS[pin as keyof typeof EMPLOYEE_PINS];
        if (!employeeId) {
            setMessage('PIN no reconocido.');
            setPin('');
            return;
        }

        const employee = employees.find(e => e.id === employeeId);
        if (employee) {
            markAttendance(employeeId, type);
            setMessage(`¡Hola, ${employee.name.split(' ')[0]}! Marcaste ${type} a las ${new Date().toLocaleTimeString('es-CL')}.`);
            setTimeout(() => {
                setPin('');
                setMessage('');
            }, 3000);
        }
    };

    // *Mejora de Contraste aplicada a botones*
    const buttonBaseStyle = "py-4 px-6 rounded-2xl font-black text-xl flex items-center justify-center transition shadow-lg";

    return (
        <div className="min-h-screen bg-slate-50 p-8 flex flex-col items-center">
            <h1 className="text-4xl font-extrabold text-slate-900 mb-10 flex items-center">
                <Clock className="mr-4" size={36} /> Reloj Control (Asistencia)
            </h1>

            <div className="w-full max-w-xl bg-white p-8 rounded-xl shadow-2xl border border-slate-200">
                <p className="text-center text-slate-600 text-lg mb-6">
                    Ingrese su PIN de empleado para marcar la hora.
                </p>

                <input
                    type="password"
                    placeholder="PIN de Empleado (4 dígitos)"
                    className="w-full text-center p-4 text-3xl tracking-widest border-2 border-slate-400 rounded-xl focus:outline-none focus:ring-4 focus:ring-cyan-700 text-slate-900"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    maxLength={4}
                />

                <div className="grid grid-cols-3 gap-4 mt-8">
                    <button
                        onClick={() => handlePinEntry('IN')}
                        className={`${buttonBaseStyle} bg-emerald-600 hover:bg-emerald-700 text-white`}
                        disabled={pin.length !== 4}
                    >
                        <LogIn className="mr-2" /> ENTRADA
                    </button>
                    <button
                        onClick={() => handlePinEntry('BREAK')}
                        className={`${buttonBaseStyle} bg-amber-500 hover:bg-amber-600 text-white`}
                        disabled={pin.length !== 4}
                    >
                        <Coffee className="mr-2" /> PAUSA
                    </button>
                    <button
                        onClick={() => handlePinEntry('OUT')}
                        className={`${buttonBaseStyle} bg-red-600 hover:bg-red-700 text-white`}
                        disabled={pin.length !== 4}
                    >
                        <LogOut className="mr-2" /> SALIDA
                    </button>
                </div>

                {message && (
                    <div className="mt-6 p-4 bg-cyan-50 border border-cyan-400 text-cyan-800 rounded-lg font-semibold text-center">
                        {message}
                    </div>
                )}
            </div>

            {/* Lista de empleados para referencia visual de estados */}
            <div className="mt-10 w-full max-w-xl">
                <h3 className="text-xl font-semibold text-slate-700 mb-3">Estado Actual de Asistencia</h3>
                {employees.map(emp => (
                    <p key={emp.id} className="text-sm p-2 border-b flex justify-between items-center">
                        {emp.name}
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${emp.isClockedIn ? 'bg-emerald-200 text-emerald-800' : 'bg-red-200 text-red-800'}`}>
                            {emp.isClockedIn ? 'EN TURNO' : 'FUERA DE TURNO'}
                        </span>
                    </p>
                ))}
            </div>
        </div>
    );
};

export default AccessControlPage;
