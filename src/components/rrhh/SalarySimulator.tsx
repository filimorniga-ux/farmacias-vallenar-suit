import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { X } from 'lucide-react';
import { Employee } from './EmployeeCard';

interface SalarySimulatorProps {
    isOpen: boolean;
    onClose: () => void;
    employee: Employee | null;
    totalCommissions: number;
}

export default function SalarySimulator({ isOpen, onClose, employee, totalCommissions }: SalarySimulatorProps) {
    if (!employee) return null;

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);
    };

    // Constants for Chilean Payroll (Approx)
    const IMM = 500000; // Ingreso Mínimo Mensual
    const GRATIFICATION_CAP = (4.75 * IMM) / 12;
    const HEALTH_DISCOUNT_RATE = 0.07; // 7%
    const AFP_DISCOUNT_RATE = 0.11; // ~11% average
    const UNEMPLOYMENT_INSURANCE_RATE = 0.006; // 0.6%

    // Calculations
    const gratification = Math.min(employee.baseSalary * 0.25, GRATIFICATION_CAP);
    const taxableIncome = employee.baseSalary + gratification + totalCommissions;

    const healthDiscount = Math.round(taxableIncome * HEALTH_DISCOUNT_RATE);
    const afpDiscount = Math.round(taxableIncome * AFP_DISCOUNT_RATE);
    const unemploymentDiscount = Math.round(taxableIncome * UNEMPLOYMENT_INSURANCE_RATE);

    const totalDiscounts = healthDiscount + afpDiscount + unemploymentDiscount;
    const liquidSalary = taxableIncome - totalDiscounts;

    return (
        <Transition.Root show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-10" onClose={onClose}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
                </Transition.Child>

                <div className="fixed inset-0 z-10 overflow-y-auto">
                    <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                            enterTo="opacity-100 translate-y-0 sm:scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                        >
                            <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                                <div className="absolute top-0 right-0 hidden pt-4 pr-4 sm:block">
                                    <button
                                        type="button"
                                        className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                                        onClick={onClose}
                                    >
                                        <span className="sr-only">Cerrar</span>
                                        <X className="h-6 w-6" aria-hidden="true" />
                                    </button>
                                </div>
                                <div className="sm:flex sm:items-start">
                                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                                        <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                                            Simulación de Liquidación de Sueldo
                                        </Dialog.Title>
                                        <div className="mt-2">
                                            <p className="text-sm text-gray-500 mb-4">
                                                Estimación para: <span className="font-bold">{employee.name}</span>
                                            </p>

                                            <div className="bg-gray-50 p-4 rounded-md space-y-3">
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-gray-600">Sueldo Base:</span>
                                                    <span className="font-medium">{formatCurrency(employee.baseSalary)}</span>
                                                </div>
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-gray-600">Gratificación Legal (Tope):</span>
                                                    <span className="font-medium">{formatCurrency(gratification)}</span>
                                                </div>
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-green-600 font-medium">Comisiones (Est.):</span>
                                                    <span className="font-medium text-green-600">{formatCurrency(totalCommissions)}</span>
                                                </div>
                                                <div className="border-t border-gray-200 pt-2 flex justify-between text-sm font-semibold">
                                                    <span>Total Haberes:</span>
                                                    <span>{formatCurrency(taxableIncome)}</span>
                                                </div>
                                            </div>

                                            <div className="mt-4 space-y-2">
                                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Descuentos Legales</h4>
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-gray-600">AFP (11%):</span>
                                                    <span className="text-red-600">-{formatCurrency(afpDiscount)}</span>
                                                </div>
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-gray-600">Salud (7%):</span>
                                                    <span className="text-red-600">-{formatCurrency(healthDiscount)}</span>
                                                </div>
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-gray-600">Seguro Cesantía (0.6%):</span>
                                                    <span className="text-red-600">-{formatCurrency(unemploymentDiscount)}</span>
                                                </div>
                                            </div>

                                            <div className="mt-6 bg-green-50 p-4 rounded-md border border-green-200">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-lg font-bold text-green-900">Sueldo Líquido:</span>
                                                    <span className="text-2xl font-black text-green-700">{formatCurrency(liquidSalary)}</span>
                                                </div>
                                            </div>

                                            <p className="mt-4 text-xs text-gray-400 text-center">
                                                * Cálculo referencial. No constituye liquidación oficial.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition.Root>
    );
}
