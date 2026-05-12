export function normalizeChileanRutInput(value: string): string {
    return value.replace(/[^0-9kK]/g, '').toUpperCase().slice(0, 9);
}

function addThousandsDots(value: string): string {
    return value.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatChileanRutInput(value: string): string {
    const clean = normalizeChileanRutInput(value);
    if (clean.length === 0) return '';

    if (clean.length < 8) {
        return addThousandsDots(clean);
    }

    const body = clean.slice(0, -1);
    const verifier = clean.slice(-1);

    return `${addThousandsDots(body)}-${verifier}`;
}

export function isCompleteChileanRutInput(value: string): boolean {
    const cleanLength = normalizeChileanRutInput(value).length;
    return cleanLength >= 8 && cleanLength <= 9;
}
