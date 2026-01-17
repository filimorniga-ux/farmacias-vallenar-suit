import React from 'react';
import { Package } from 'lucide-react';

const InventorySkeleton = () => {
    return (
        <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
            <div className="p-6 pb-0 shrink-0">
                {/* Header Skeleton */}
                <div className="mb-6 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
                    <div className="w-full">
                        <div className="h-8 w-64 bg-slate-200 rounded-lg animate-pulse mb-2"></div>
                        <div className="flex items-center gap-3 mt-2">
                            <div className="h-4 w-32 bg-slate-200 rounded animate-pulse"></div>
                            <div className="h-6 w-24 bg-slate-200 rounded-full animate-pulse"></div>
                            <div className="h-8 w-40 bg-slate-200 rounded-lg animate-pulse"></div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <div className="h-12 w-32 bg-slate-200 rounded-full animate-pulse"></div>
                        <div className="h-12 w-32 bg-slate-200 rounded-full animate-pulse hidden md:block"></div>
                        <div className="h-12 w-32 bg-slate-200 rounded-full animate-pulse hidden md:block"></div>
                    </div>
                </div>

                <div className="flex gap-4 mb-6 border-b border-slate-200 pb-1">
                    <div className="h-10 w-32 bg-slate-200 rounded-t-lg animate-pulse"></div>
                    <div className="h-10 w-32 bg-slate-200 rounded-t-lg animate-pulse"></div>
                    <div className="h-10 w-32 bg-slate-200 rounded-t-lg animate-pulse"></div>
                </div>

                <div className="p-4 flex gap-4 items-center bg-slate-50/50 mb-4">
                    <div className="flex-1 h-10 bg-slate-200 rounded-xl animate-pulse"></div>
                    <div className="h-10 w-24 bg-slate-200 rounded-lg animate-pulse"></div>
                    <div className="h-10 w-24 bg-slate-200 rounded-lg animate-pulse"></div>
                </div>
            </div>

            {/* List Skeleton */}
            <div className="flex-1 px-6 pb-20 overflow-hidden">
                <div className="bg-white md:rounded-3xl md:shadow-sm md:border border-slate-200 h-full flex flex-col">
                    {/* Table Header (Desktop) */}
                    <div className="hidden md:flex p-4 border-b border-slate-200">
                        <div className="w-[30%] h-4 bg-slate-200 rounded animate-pulse"></div>
                        <div className="w-[20%] h-4 bg-slate-200 rounded animate-pulse ml-4"></div>
                        <div className="w-[15%] h-4 bg-slate-200 rounded animate-pulse ml-4"></div>
                        <div className="w-[15%] h-4 bg-slate-200 rounded animate-pulse ml-4"></div>
                        <div className="w-[10%] h-4 bg-slate-200 rounded animate-pulse ml-auto"></div>
                        <div className="w-[10%] h-4 bg-slate-200 rounded animate-pulse ml-4"></div>
                    </div>

                    {/* Rows */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {[...Array(8)].map((_, i) => (
                            <div key={i} className="flex flex-col md:flex-row gap-4 p-4 border border-slate-100 rounded-xl">
                                {/* Mobile/Desktop adaptive structure simulation */}
                                <div className="flex-1 space-y-2">
                                    <div className="h-6 w-3/4 bg-slate-200 rounded animate-pulse"></div>
                                    <div className="h-4 w-1/2 bg-slate-200 rounded animate-pulse"></div>
                                </div>
                                <div className="hidden md:block w-[20%] space-y-2">
                                    <div className="h-4 w-full bg-slate-200 rounded animate-pulse"></div>
                                    <div className="h-4 w-2/3 bg-slate-200 rounded animate-pulse"></div>
                                </div>
                                <div className="flex justify-between md:block md:w-[15%]">
                                    <div className="h-8 w-16 bg-slate-200 rounded animate-pulse"></div>
                                </div>
                                <div className="flex justify-between md:block md:w-[15%]">
                                    <div className="h-8 w-12 bg-slate-200 rounded animate-pulse"></div>
                                </div>
                                <div className="md:w-[10%] flex justify-end">
                                    <div className="h-6 w-20 bg-slate-200 rounded animate-pulse"></div>
                                </div>
                                <div className="md:w-[10%] flex justify-center gap-2">
                                    <div className="h-8 w-8 bg-slate-200 rounded-lg animate-pulse"></div>
                                    <div className="h-8 w-8 bg-slate-200 rounded-lg animate-pulse"></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InventorySkeleton;
