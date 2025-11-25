interface SalesChartProps {
    data: {
        date: string;
        total: number;
    }[];
}

export default function SalesChart({ data }: SalesChartProps) {
    const maxTotal = Math.max(...data.map((d) => d.total), 1); // Avoid division by zero

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(amount);
    };

    return (
        <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">Ventas Últimos 7 Días</h3>
            <div className="relative h-64 flex items-end justify-between space-x-2">
                {data.map((day, index) => {
                    const heightPercentage = Math.round((day.total / maxTotal) * 100);
                    return (
                        <div key={index} className="flex flex-col items-center flex-1 group">
                            <div
                                className="w-full bg-purple-200 rounded-t-md hover:bg-purple-300 transition-all relative"
                                style={{ height: `${heightPercentage}%` }}
                            >
                                <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs rounded py-1 px-2 pointer-events-none z-10 whitespace-nowrap">
                                    {formatCurrency(day.total)}
                                </div>
                            </div>
                            <div className="mt-2 text-xs text-gray-500 rotate-0 truncate w-full text-center">
                                {day.date}
                            </div>
                        </div>
                    );
                })}
                {data.length === 0 && (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                        No hay datos suficientes
                    </div>
                )}
            </div>
        </div>
    );
}
