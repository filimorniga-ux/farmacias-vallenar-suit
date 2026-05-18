export type PublicKioskLocation = {
    id: string;
    name: string;
};

export function isUsablePublicKioskLocationId(locationId: string | null | undefined): locationId is string {
    return typeof locationId === 'string' && locationId.length > 30;
}

export function findAvailablePublicKioskLocation(
    locations: readonly PublicKioskLocation[],
    locationId: string | null | undefined,
): PublicKioskLocation | null {
    if (!isUsablePublicKioskLocationId(locationId)) return null;
    return locations.find((location) => location.id === locationId) ?? null;
}
