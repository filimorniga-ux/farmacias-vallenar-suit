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

export function isValidChileanRutInput(value: string): boolean {
    const clean = normalizeChileanRutInput(value);
    if (clean.length < 8 || clean.length > 9) return false;

    const body = clean.slice(0, -1);
    const verifier = clean.slice(-1);
    if (!/^\d+$/.test(body)) return false;

    let multiplier = 2;
    let sum = 0;
    for (let index = body.length - 1; index >= 0; index -= 1) {
        sum += Number(body[index]) * multiplier;
        multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }

    const expectedValue = 11 - (sum % 11);
    const expectedVerifier = expectedValue === 11
        ? '0'
        : expectedValue === 10
            ? 'K'
            : String(expectedValue);

    return verifier === expectedVerifier;
}

export function isCompleteChileanRutInput(value: string): boolean {
    return isValidChileanRutInput(value);
}
