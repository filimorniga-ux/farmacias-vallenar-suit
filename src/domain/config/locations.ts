export const LOCATIONS = {
    WAREHOUSE_MAIN: 'BODEGA_CENTRAL',
    STORE_CENTRO: 'SUCURSAL_CENTRO',
    STORE_NORTE: 'SUCURSAL_NORTE'
} as const;

export type LocationId = typeof LOCATIONS[keyof typeof LOCATIONS];

export const LOCATION_NAMES: Record<LocationId, string> = {
    [LOCATIONS.WAREHOUSE_MAIN]: 'Bodega Central (Trastienda)',
    [LOCATIONS.STORE_CENTRO]: 'Sucursal Centro (Sala de Ventas)',
    [LOCATIONS.STORE_NORTE]: 'Sucursal Norte'
};
