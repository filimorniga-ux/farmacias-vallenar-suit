'use client';

import { useState } from 'react';
import EmployeeCard, { Employee } from './EmployeeCard';
import SalarySimulator from './SalarySimulator';
import { PayrollData } from '@/lib/data/payroll';

interface EmployeeGridProps {
    employees: Employee[];
    payrollData: PayrollData;
}

export default function EmployeeGrid({ employees, payrollData }: EmployeeGridProps) {
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);

    const handleSimulateSalary = (employee: Employee) => {
        setSelectedEmployee(employee);
        setIsSimulatorOpen(true);
    };

    return (
        <>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {employees.map((employee) => (
                    <EmployeeCard
                        key={employee.id}
                        employee={employee}
                        payrollData={payrollData}
                        onSimulateSalary={handleSimulateSalary}
                    />
                ))}
            </div>

            <SalarySimulator
                isOpen={isSimulatorOpen}
                onClose={() => setIsSimulatorOpen(false)}
                employee={selectedEmployee}
                totalCommissions={payrollData.totalCommissions} // Passing global commissions for demo
            />
        </>
    );
}
