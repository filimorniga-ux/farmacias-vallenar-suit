import { DollarSign, Receipt, TrendingDown, TrendingUp } from 'lucide-react';

interface KPICardsProps {
    stats: {
        totalSales: number;
        ticketCount: number;
        averageTicket: number;
        ivaDebit: number;
    };
}

export default function KPICards({ stats }: KPICardsProps) {
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);
    };

    return (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {/* Total Sales */}
            <div className="overflow-hidden rounded-lg bg-white shadow">
                <div className="p-5">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <DollarSign className="h-6 w-6 text-gray-400" aria-hidden="true" />
                        </div>
                        <div className="ml-5 w-0 flex-1">
                            <dl>
                                <dt className="truncate text-sm font-medium text-gray-500">Ventas Totales (Mes)</dt>
                                <dd>
                                    <div className="text-lg font-medium text-gray-900">{formatCurrency(stats.totalSales)}</div>
                                </dd>
                            </dl>
                        </div>
                    </div>
                </div>
            </div>

            {/* Ticket Count */}
            <div className="overflow-hidden rounded-lg bg-white shadow">
                <div className="p-5">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <Receipt className="h-6 w-6 text-gray-400" aria-hidden="true" />
                        </div>
                        <div className="ml-5 w-0 flex-1">
                            <dl>
                                <dt className="truncate text-sm font-medium text-gray-500">Tickets Emitidos</dt>
                                <dd>
                                    <div className="text-lg font-medium text-gray-900">{stats.ticketCount}</div>
                                </dd>
                            </dl>
                        </div>
                    </div>
                </div>
            </div>

            {/* Average Ticket */}
            <div className="overflow-hidden rounded-lg bg-white shadow">
                <div className="p-5">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <TrendingUp className="h-6 w-6 text-gray-400" aria-hidden="true" />
                        </div>
                        <div className="ml-5 w-0 flex-1">
                            <dl>
                                <dt className="truncate text-sm font-medium text-gray-500">Ticket Promedio</dt>
                                <dd>
                                    <div className="text-lg font-medium text-gray-900">{formatCurrency(stats.averageTicket)}</div>
                                </dd>
                            </dl>
                        </div>
                    </div>
                </div>
            </div>

            {/* F29 Tax Estimate */}
            <div className="overflow-hidden rounded-lg bg-purple-50 border border-purple-200 shadow">
                <div className="p-5">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <TrendingDown className="h-6 w-6 text-purple-600" aria-hidden="true" />
                        </div>
                        <div className="ml-5 w-0 flex-1">
                            <dl>
                                <dt className="truncate text-sm font-medium text-purple-800">Estimación Impuesto (F29)</dt>
                                <dd>
                                    <div className="text-lg font-bold text-purple-900">{formatCurrency(stats.ivaDebit)}</div>
                                </dd>
                            </dl>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
