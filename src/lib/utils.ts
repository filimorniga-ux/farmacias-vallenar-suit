export function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
    }).format(amount);
}

export function cn(...classes: (string | undefined | null | false)[]) {
    return classes.filter(Boolean).join(' ');
}

export function formatRut(rut: string): string {
    // Eliminar todo lo que no sea números o k/K
    let value = rut.replace(/[^0-9kK]/g, '');

    if (value.length === 0) return '';

    // Separar cuerpo y dígito verificador
    const dv = value.slice(-1);
    let body = value.slice(0, -1);

    if (body.length === 0) return value;

    // Formatear cuerpo con puntos
    body = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    return `${body}-${dv}`;
}

export function isValidUUID(id?: string | null): boolean {
    if (!id) return false;
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return regex.test(id);
}
