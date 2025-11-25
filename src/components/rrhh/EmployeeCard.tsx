import { User, Briefcase, DollarSign, AlertCircle, CheckCircle } from 'lucide-react';
import { PayrollData } from '@/lib/data/payroll';

export interface Employee {
    id: number;
    name: string;
    role: string;
    baseSalary: number;
    isActive: boolean;
    photoUrl?: string;
}

interface EmployeeCardProps {
    employee: Employee;
    payrollData: PayrollData;
    onSimulateSalary: (employee: Employee) => void;
}

export default function EmployeeCard({ employee, payrollData, onSimulateSalary }: EmployeeCardProps) {
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);
    };

    // Mock logic: Distribute total commissions among employees for demo purposes
    // In a real app, we would filter sales by employee_id.
    // Here we assume this employee gets a share or all of it for the demo.
    // Let's say we split it evenly or just show the total for the store manager.
    // For the purpose of this mock, we'll show the global store stats as if they were the employee's performance
    // or a fraction of it. Let's just use the global data to demonstrate the "Anti-Canela" breakdown.

    return (
        <div className="bg-white overflow-hidden shadow rounded-lg divide-y divide-gray-200">
            <div className="px-4 py-5 sm:px-6 flex items-center justify-between">
                <div className="flex items-center">
                    <div className="flex-shrink-0 h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center">
                        {employee.photoUrl ? (
                            <img className="h-12 w-12 rounded-full" src={employee.photoUrl} alt="" />
                        ) : (
                            <User className="h-6 w-6 text-gray-500" />
                        )}
                    </div>
                    <div className="ml-4">
                        <h3 className="text-lg leading-6 font-medium text-gray-900">{employee.name}</h3>
                        <p className="text-sm text-gray-500 flex items-center">
                            <Briefcase className="h-4 w-4 mr-1" /> {employee.role}
                        </p>
                    </div>
                </div>
                <div>
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${employee.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {employee.isActive ? 'Turno Activo' : 'Inactivo'}
                    </span>
                </div>
            </div>
            <div className="px-4 py-5 sm:p-6">
                <h4 className="text-sm font-medium text-gray-500 mb-3">Desempeño de Ventas (Tienda)</h4>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                    <div className="sm:col-span-1">
                        <dt className="text-sm font-medium text-gray-500">Ventas Totales</dt>
                        <dd className="mt-1 text-sm text-gray-900 font-semibold">{formatCurrency(payrollData.totalSales)}</dd>
                    </div>
                    <div className="sm:col-span-1">
                        <dt className="text-sm font-medium text-green-600">Comisionables (3%)</dt>
                        <dd className="mt-1 text-sm text-gray-900">{formatCurrency(payrollData.commissionableSales)}</dd>
                    </div>
                    <div className="sm:col-span-2 bg-yellow-50 p-2 rounded-md border border-yellow-200">
                        <dt className="text-xs font-medium text-yellow-800 flex items-center">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            No Comisionables (Medicamentos) - Ley Anti-Canela
                        </dt>
                        <dd className="mt-1 text-sm text-gray-900 font-bold">{formatCurrency(payrollData.nonCommissionableSales)}</dd>
                    </div>
                </dl>
            </div>
            <div className="px-4 py-4 sm:px-6">
                <button
                    type="button"
                    onClick={() => onSimulateSalary(employee)}
                    className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                    <DollarSign className="-ml-1 mr-2 h-5 w-5" />
                    Simular Liquidación
                </button>
            </div>
        </div>
    );
}
