import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { createProductExpressSecure } from '@/actions/products-v2';
import { usePharmaStore } from '../../store/useStore';
import { ScanBarcode, Save, Loader2, DollarSign, Tag, AlertTriangle } from 'lucide-react';

interface ExpressAddProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    scannedBarcode: string;
    onSuccess: (product: any) => void;
}

export const ExpressAddProductModal: React.FC<ExpressAddProductModalProps> = ({
    isOpen,
    onClose,
    scannedBarcode,
    onSuccess
}) => {
    const { user } = usePharmaStore();
    const [name, setName] = useState('');
    const [price, setPrice] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Reset when opening
    useEffect(() => {
        if (isOpen) {
            setName('');
            setPrice('');
        }
    }, [isOpen, scannedBarcode]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!user?.id) {
            toast.error('Sesión inválida');
            return;
        }

        if (!name.trim() || !price || parseFloat(price) <= 0) {
            toast.error('Complete los datos obligatorios');
            return;
        }

        setIsLoading(true);
        try {
            const result = await createProductExpressSecure({
                barcode: scannedBarcode,
                name: name.trim().toUpperCase(), // Standardization
                price: parseFloat(price),
                userId: user.id
            });

            if (result.success && result.data) {
                toast.success('Producto creado y agregado al carrito', {
                    description: `${result.data.name} - $${price}`
                });

                // Construct a mock inventory object to add immediately
                // In production, this should ideally verify against DB, but for speed we construct it matchin backend defaults.
                const newProduct = {
                    id: result.data.productId,
                    sku: scannedBarcode,
                    name: name.trim().toUpperCase(),
                    price: parseFloat(price),
                    stock_actual: 100, // Matching dummy stock
                    is_new: true
                };

                onSuccess(newProduct);
                onClose();
            } else {
                toast.error(result.error || 'Error al crear producto');
            }
        } catch (error) {
            console.error(error);
            toast.error('Error de conexión');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !isLoading && onClose()}>
            <DialogContent className="sm:max-w-md border-orange-500/50">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-orange-600">
                        <AlertTriangle className="h-5 w-5" />
                        Producto No Encontrado
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-sm text-orange-800">
                        Este código no está registrado. Ingrese los datos básicos para venderlo de inmediato.
                        <br />
                        <span className="font-semibold text-xs mt-1 block">Se marcará como "Pendiente" en el inventario.</span>
                    </div>

                    <div className="space-y-2">
                        <Label>Código Escaneado</Label>
                        <div className="relative">
                            <ScanBarcode className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                value={scannedBarcode}
                                readOnly
                                className="pl-9 bg-slate-100 font-mono"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="name">Nombre del Producto <span className="text-red-500">*</span></Label>
                        <div className="relative">
                            <Tag className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ej: PARACETAMOL 500MG"
                                className="pl-9"
                                autoFocus
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="price">Precio Venta <span className="text-red-500">*</span></Label>
                        <div className="relative">
                            <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="price"
                                type="number"
                                min="0"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                placeholder="0"
                                className="pl-9"
                            />
                        </div>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0 mt-4">
                        <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
                            Cancelar
                        </Button>
                        <Button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white" disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Guardando...
                                </>
                            ) : (
                                <>
                                    <Save className="mr-2 h-4 w-4" />
                                    Crear y Agregar
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
