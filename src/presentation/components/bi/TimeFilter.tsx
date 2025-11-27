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

const TimeFilter: React.FC<TimeFilterProps> = ({ onFilterChange, initialRange }) => {
    const [fromDate, setFromDate] = useState<string>(
        initialRange?.from.toISOString().split('T')[0] ||
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    );
    const [toDate, setToDate] = useState<string>(
        initialRange?.to.toISOString().split('T')[0] ||
        new Date().toISOString().split('T')[0]
    );
    const [showPresets, setShowPresets] = useState(false);

    const presets = [
        { label: 'Últimos 7 días', days: 7 },
        { label: 'Últimos 30 días', days: 30 },
        { label: 'Este mes', days: 'current_month' as const },
        { label: 'Mes anterior', days: 'last_month' as const },
        { label: 'Este trimestre', days: 'current_quarter' as const },
        { label: 'Este año', days: 'current_year' as const },
    ];

    const applyPreset = (preset: typeof presets[0]) => {
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
                case 'current_quarter':
                    const quarter = Math.floor(today.getMonth() / 3);
                    from = new Date(today.getFullYear(), quarter * 3, 1);
                    break;
                case 'current_year':
                    from = new Date(today.getFullYear(), 0, 1);
                    break;
                default:
                    from = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
            }
        }

        setFromDate(from.toISOString().split('T')[0]);
        setToDate(to.toISOString().split('T')[0]);
        setShowPresets(false);
    };

    const handleApply = () => {
        onFilterChange({
            from: new Date(fromDate),
            to: new Date(toDate + 'T23:59:59')
        });
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex flex-wrap items-end gap-4">
                {/* Date Range */}
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                        Desde
                    </label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="date"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                </div>

                <div className="flex-1 min-w-[200px]">
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                        Hasta
                    </label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="date"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                </div>

                {/* Presets Dropdown */}
                <div className="relative">
                    <button
                        onClick={() => setShowPresets(!showPresets)}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 font-medium text-sm border border-gray-300"
                    >
                        Presets
                        <ChevronDown className="w-4 h-4" />
                    </button>
                    {showPresets && (
                        <div className="absolute top-full mt-2 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[180px]">
                            {presets.map((preset, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => applyPreset(preset)}
                                    className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm text-gray-700 first:rounded-t-lg last:rounded-b-lg"
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Apply Button */}
                <button
                    onClick={handleApply}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold text-sm shadow-lg shadow-blue-200"
                >
                    Aplicar Filtros
                </button>
            </div>
        </div>
    );
};

export default TimeFilter;
