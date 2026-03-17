import React, { useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

export interface DateRange {
    from: Date;
    to: Date;
}

interface TimeFilterProps {
    onFilterChange: (range: DateRange) => void;
    initialRange?: DateRange;
}

const formatDateInput = (date: Date) => date.toISOString().split('T')[0];

const getDefaultFromDate = (initialRange?: DateRange) => {
    if (initialRange?.from) return formatDateInput(initialRange.from);
    const now = new Date();
    now.setDate(now.getDate() - 7);
    return formatDateInput(now);
};

const getDefaultToDate = (initialRange?: DateRange) => {
    if (initialRange?.to) return formatDateInput(initialRange.to);
    return formatDateInput(new Date());
};

const TimeFilter: React.FC<TimeFilterProps> = ({ onFilterChange, initialRange }) => {
    const [fromDate, setFromDate] = useState<string>(() => getDefaultFromDate(initialRange));
    const [toDate, setToDate] = useState<string>(() => getDefaultToDate(initialRange));
    const [selectedPreset, setSelectedPreset] = useState<string>('custom');

    const presets = [
        { value: 'last_7_days', label: 'Últimos 7 días', days: 7 },
        { value: 'last_30_days', label: 'Últimos 30 días', days: 30 },
        { value: 'current_month', label: 'Este mes', days: 'current_month' as const },
        { value: 'last_month', label: 'Mes anterior', days: 'last_month' as const },
        { value: 'current_quarter', label: 'Este trimestre', days: 'current_quarter' as const },
        { value: 'current_year', label: 'Este año', days: 'current_year' as const },
    ];

    const applyPreset = (presetValue: string) => {
        const preset = presets.find((item) => item.value === presetValue);
        if (!preset) return;

        const today = new Date();
        let from: Date;
        let to: Date = today;

        if (typeof preset.days === 'number') {
            from = new Date(today.getTime() - preset.days * 24 * 60 * 60 * 1000);
        } else {
            switch (preset.days) {
                case 'current_month':
                    from = new Date(today.getFullYear(), today.getMonth(), 1);
                    break;
                case 'last_month':
                    from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                    to = new Date(today.getFullYear(), today.getMonth(), 0);
                    break;
                case 'current_quarter': {
                    const quarter = Math.floor(today.getMonth() / 3);
                    from = new Date(today.getFullYear(), quarter * 3, 1);
                    break;
                }
                case 'current_year':
                    from = new Date(today.getFullYear(), 0, 1);
                    break;
                default:
                    from = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
            }
        }

        setFromDate(from.toISOString().split('T')[0]);
        setToDate(to.toISOString().split('T')[0]);
    };

    const handlePresetChange = (value: string) => {
        setSelectedPreset(value);
        if (value === 'custom') return;
        applyPreset(value);
    };

    const handleApply = () => {
        onFilterChange({
            from: new Date(fromDate),
            to: new Date(toDate + 'T23:59:59')
        });
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-5">
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px_auto] gap-3 md:gap-4 items-end">
                <div className="w-full">
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                        Desde
                    </label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="date"
                            value={fromDate}
                            onChange={(e) => {
                                setSelectedPreset('custom');
                                setFromDate(e.target.value);
                            }}
                            className="w-full pl-10 pr-4 py-3 md:py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        />
                    </div>
                </div>

                <div className="w-full">
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                        Hasta
                    </label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="date"
                            value={toDate}
                            onChange={(e) => {
                                setSelectedPreset('custom');
                                setToDate(e.target.value);
                            }}
                            className="w-full pl-10 pr-4 py-3 md:py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        />
                    </div>
                </div>

                <div className="w-full">
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                        Preset
                    </label>
                    <div className="relative">
                        <select
                            aria-label="Seleccionar rango predefinido"
                            value={selectedPreset}
                            onChange={(e) => handlePresetChange(e.target.value)}
                            className="w-full appearance-none px-4 pr-10 py-3 md:py-2.5 bg-gray-50 text-gray-700 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-medium"
                        >
                            <option value="custom">Personalizado</option>
                            {presets.map((preset) => (
                                <option key={preset.value} value={preset.value}>
                                    {preset.label}
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    </div>
                </div>

                <button
                    onClick={handleApply}
                    className="w-full md:w-auto px-6 py-3 md:py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold text-sm shadow-lg shadow-blue-200"
                >
                    Aplicar Filtros
                </button>
            </div>
        </div>
    );
};

export default TimeFilter;
