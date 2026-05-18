'use client';

import { useState } from 'react';
import type { Supplier } from '@/lib/data/supply';
import { useRouter } from 'next/navigation';
import { CheckCircle, Loader2 } from 'lucide-react';

interface ReceptionFormProps {
    suppliers: Supplier[];
    products: { id: number; nombre: string }[]; // Simplified product list for select
}

export default function ReceptionForm({ suppliers, products }: ReceptionFormProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [formData, setFormData] = useState({
        proveedor_id: '',
        producto_id: '',
        cantidad: '',
        numero_lote: '',
        fecha_vencimiento: '',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch('/api/supply/receive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    producto_id: Number(formData.producto_id),
                    cantidad: Number(formData.cantidad)
                }),
            });

            if (!res.ok) throw new Error('Error al recibir producto');

            setSuccess(true);
            setFormData({
                proveedor_id: '',
                producto_id: '',
                cantidad: '',
                numero_lote: '',
                fecha_vencimiento: '',
            });
            router.refresh(); // Refresh server components
            setTimeout(() => setSuccess(false), 3000);
        } catch (error) {
            console.error(error);
            alert('Error al guardar la recepción');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
                <h3 className="text-base font-semibold leading-6 text-gray-900">Ingreso de Mercadería (Factura)</h3>
                <div className="mt-2 max-w-xl text-sm text-gray-500">
                    <p>Registre la recepción de productos para actualizar el stock.</p>
                </div>
                <form className="mt-5 space-y-4" onSubmit={handleSubmit}>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <label htmlFor="proveedor" className="block text-sm font-medium text-gray-700">Proveedor</label>
                            <select
                                id="proveedor"
                                required
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm p-2 border"
                                value={formData.proveedor_id}
                                onChange={(e) => setFormData({ ...formData, proveedor_id: e.target.value })}
                            >
                                <option value="">Seleccione...</option>
                                {suppliers.map(s => (
                                    <option key={s.id} value={s.id}>{s.nombre_fantasia}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label htmlFor="producto" className="block text-sm font-medium text-gray-700">Producto</label>
                            <select
                                id="producto"
                                required
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm p-2 border"
                                value={formData.producto_id}
                                onChange={(e) => setFormData({ ...formData, producto_id: e.target.value })}
                            >
                                <option value="">Seleccione...</option>
                                {products.map(p => (
                                    <option key={p.id} value={p.id}>{p.nombre}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label htmlFor="cantidad" className="block text-sm font-medium text-gray-700">Cantidad</label>
                            <input
                                type="number"
                                id="cantidad"
                                required
                                min="1"
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm p-2 border"
                                value={formData.cantidad}
                                onChange={(e) => setFormData({ ...formData, cantidad: e.target.value })}
                            />
                        </div>

                        <div>
                            <label htmlFor="lote" className="block text-sm font-medium text-gray-700">Nuevo Lote</label>
                            <input
                                type="text"
                                id="lote"
                                required
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm p-2 border"
                                value={formData.numero_lote}
                                onChange={(e) => setFormData({ ...formData, numero_lote: e.target.value })}
                            />
                        </div>

                        <div>
                            <label htmlFor="vencimiento" className="block text-sm font-medium text-gray-700">Vencimiento</label>
                            <input
                                type="date"
                                id="vencimiento"
                                required
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm p-2 border"
                                value={formData.fecha_vencimiento}
                                onChange={(e) => setFormData({ ...formData, fecha_vencimiento: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className="inline-flex justify-center rounded-md bg-purple-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-purple-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Registrar Recepción'}
                        </button>
                        {success && (
                            <span className="ml-3 inline-flex items-center text-green-600 text-sm font-medium">
                                <CheckCircle className="h-5 w-5 mr-1" /> Guardado
                            </span>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}
