'use client';

import { useState } from 'react';
import EmployeeCard, { Employee } from './EmployeeCard';
import SalarySimulator from './SalarySimulator';
import { PayrollData } from '@/lib/data/payroll';
import { EmployeeModal } from '@/presentation/components/hr/EmployeeModal';

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

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedProfile, setSelectedProfile] = useState<any>(null); // Using any to bypass strict type check for now, or import EmployeeProfile

    const handleEditEmployee = (employee: Employee) => {
        const profile = {
            id: employee.id.toString(),
            rut: '', // Not available in grid
            name: employee.name,
            role: employee.role as any,
            status: employee.isActive ? 'ACTIVE' : 'ON_LEAVE',
            base_salary: employee.baseSalary,
            pension_fund: employee.pension_fund,
            health_system: employee.health_system,
            access_pin: '',
            job_title: 'QUIMICO_FARMACEUTICO' as any,
            current_status: 'OUT' as any
        };
        setSelectedProfile(profile);
        setIsModalOpen(true);
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
                        onEdit={() => handleEditEmployee(employee)}
                    />
                ))}
            </div>

            <SalarySimulator
                isOpen={isSimulatorOpen}
                onClose={() => setIsSimulatorOpen(false)}
                employee={selectedEmployee}
                totalCommissions={payrollData.totalCommissions}
            />

            <EmployeeModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                employee={selectedProfile}
                onSave={(updated) => {
                    console.log('Saved:', updated);
                    setIsModalOpen(false);
                    // Ideally trigger a refresh
                }}
            />
        </>
    );
}
