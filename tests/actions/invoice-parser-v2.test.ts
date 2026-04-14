import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  approveInvoiceParsingSecure,
  getInvoiceParsingSecure,
  getPendingParsingsSecure,
  getSmartInvoiceLocationsSecure,
  parseInvoiceDocumentSecure,
  searchProductsForMappingSecure,
} from '@/actions/invoice-parser-v2';
import { pool, query } from '@/lib/db';
import { getAIConfigSecure, getSystemConfigSecure } from '@/actions/config-v2';
import {
  requireProcurementActor,
  resolveEffectiveProcurementLocation,
} from '@/actions/procurement-scope';

vi.mock('@/lib/db', () => ({
  pool: { connect: vi.fn() },
  query: vi.fn(),
}));

vi.mock('@/actions/config-v2', () => ({
  getAIConfigSecure: vi.fn(),
  getSystemConfigSecure: vi.fn(),
}));

vi.mock('@/lib/server-session', () => ({
  getValidatedSession: vi.fn(),
}));

vi.mock('@/actions/procurement-scope', () => ({
  PROCUREMENT_READ_ROLES: ['WAREHOUSE', 'WAREHOUSE_CHIEF', 'MANAGER', 'QF', 'ADMIN', 'GERENTE_GENERAL'],
  PROCUREMENT_WRITE_ROLES: ['WAREHOUSE', 'WAREHOUSE_CHIEF', 'MANAGER', 'QF', 'ADMIN', 'GERENTE_GENERAL'],
  requireProcurementActor: vi.fn(),
  resolveEffectiveProcurementLocation: vi.fn(),
}));

type MockQueryResult = {
  command: string;
  rowCount: number;
  oid: number;
  fields: never[];
  rows: Array<Record<string, unknown>>;
};

function makeQueryResult(
  rows: Array<Record<string, unknown>>,
  rowCount = rows.length,
): MockQueryResult {
  return {
    command: 'SELECT',
    rowCount,
    oid: 0,
    fields: [],
    rows,
  };
}

const scopedActor = {
  userId: '550e8400-e29b-41d4-a716-446655440111',
  role: 'ADMIN',
  locationId: '550e8400-e29b-41d4-a716-446655440222',
  userName: 'Admin',
  tokenVersion: 1,
  sessionToken: 'token',
};

describe('invoice-parser-v2', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(requireProcurementActor).mockResolvedValue({
      success: true,
      actor: scopedActor,
    });

    vi.mocked(resolveEffectiveProcurementLocation).mockImplementation((_, requestedLocationId) => ({
      success: true,
      locationId: requestedLocationId || undefined,
    }));
  });

  it('rechaza consultas sin actor válido', async () => {
    vi.mocked(requireProcurementActor).mockResolvedValueOnce({
      success: false,
      error: 'Sesión no válida. Vuelve a iniciar sesión.',
    });

    const result = await getPendingParsingsSecure({
      page: 1,
      pageSize: 20,
      status: 'ALL',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Sesión no válida');
  });

  it('scopea ubicaciones del feature al actor y entrega payload mínimo', async () => {
    vi.mocked(resolveEffectiveProcurementLocation).mockReturnValueOnce({
      success: true,
      locationId: '550e8400-e29b-41d4-a716-446655440222',
    });
    vi.mocked(query).mockResolvedValueOnce(makeQueryResult([
      {
        id: '550e8400-e29b-41d4-a716-446655440222',
        name: 'Sucursal Centro',
      },
    ]));

    const result = await getSmartInvoiceLocationsSecure();

    expect(result).toEqual({
      success: true,
      data: [
        {
          id: '550e8400-e29b-41d4-a716-446655440222',
          name: 'Sucursal Centro',
        },
      ],
    });
    expect(vi.mocked(query)).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id::text AS id, name'),
      ['550e8400-e29b-41d4-a716-446655440222'],
    );
  });

  it('aplica búsqueda con wildcard correcto y pagina con límite seguro', async () => {
    const mockQuery = vi.mocked(query);
    mockQuery
      .mockResolvedValueOnce(makeQueryResult([{ total: '1' }]))
      .mockResolvedValueOnce(makeQueryResult([{ id: 'ip-1', supplier_name: 'Proveedor Test' }]));

    const result = await getPendingParsingsSecure({
      page: 2,
      pageSize: 999,
      searchTerm: 'ACME',
      status: 'ALL',
    });

    expect(result.success).toBe(true);
    expect(mockQuery).toHaveBeenCalledTimes(2);

    const secondCallParams = mockQuery.mock.calls[1]?.[1] as unknown[];
    expect(secondCallParams).toContain('%acme%');
    expect(secondCallParams).toContain(100);
    expect(secondCallParams).toContain(100);
  });

  it('fuerza scope server-side en el listado cuando el actor no es global', async () => {
    vi.mocked(requireProcurementActor).mockResolvedValueOnce({
      success: true,
      actor: {
        ...scopedActor,
        role: 'MANAGER',
        locationId: '550e8400-e29b-41d4-a716-446655440333',
      },
    });
    vi.mocked(resolveEffectiveProcurementLocation).mockReturnValueOnce({
      success: true,
      locationId: '550e8400-e29b-41d4-a716-446655440333',
    });

    const mockQuery = vi.mocked(query);
    mockQuery
      .mockResolvedValueOnce(makeQueryResult([{ total: '0' }]))
      .mockResolvedValueOnce(makeQueryResult([]));

    const result = await getPendingParsingsSecure({ page: 1, pageSize: 20 });

    expect(result.success).toBe(true);
    expect(mockQuery.mock.calls[0]?.[1]).toEqual([
      '550e8400-e29b-41d4-a716-446655440333',
      20,
      0,
    ]);
  });

  it('arma correctamente parámetros de búsqueda de productos para mapeo', async () => {
    const mockQuery = vi.mocked(query);
    mockQuery.mockResolvedValueOnce(makeQueryResult([]));

    const result = await searchProductsForMappingSecure('PARA_500', 10);

    expect(result.success).toBe(true);
    const params = mockQuery.mock.calls[0]?.[1] as unknown[];
    expect(params[0]).toBe('%PARA500%');
    expect(params[1]).toBe('PARA500%');
    expect(params[2]).toBe(10);
    expect(params[3]).toBeNull();
  });

  it('rechaza parse cuando la ubicación pedida sale del scope del actor', async () => {
    vi.mocked(resolveEffectiveProcurementLocation).mockReturnValueOnce({
      success: false,
      error: 'Acceso denegado a otra ubicación',
    });

    const result = await parseInvoiceDocumentSecure({
      fileBase64: 'A'.repeat(140),
      fileType: 'image',
      fileName: 'factura-test.png',
      locationId: '550e8400-e29b-41d4-a716-446655440999',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Acceso denegado');
  });

  it('permite proveedor DEEPSEEK_OCR sin API key y avanza al control de límite mensual', async () => {
    vi.mocked(resolveEffectiveProcurementLocation).mockReturnValueOnce({
      success: true,
      locationId: '550e8400-e29b-41d4-a716-446655440222',
    });
    vi.mocked(getAIConfigSecure).mockResolvedValue({
      provider: 'DEEPSEEK_OCR',
      apiKey: null,
      fallbackApiKey: null,
      model: 'deepseek-ocr',
      maxTokens: 4096,
      temperature: 0.1,
      monthlyLimit: 1,
      fallbackProvider: 'NONE',
      isConfigured: true,
    });
    vi.mocked(getSystemConfigSecure).mockResolvedValue('https://ocr.example.com/parse');

    const mockQuery = vi.mocked(query);
    mockQuery.mockResolvedValueOnce(makeQueryResult([{ count: '1' }]));

    const result = await parseInvoiceDocumentSecure({
      fileBase64: 'A'.repeat(140),
      fileType: 'image',
      fileName: 'factura-test.png',
      locationId: '550e8400-e29b-41d4-a716-446655440222',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Límite mensual');
  });

  it('retorna error claro si DEEPSEEK_OCR no tiene endpoint configurado', async () => {
    vi.mocked(resolveEffectiveProcurementLocation).mockReturnValueOnce({
      success: true,
      locationId: '550e8400-e29b-41d4-a716-446655440222',
    });
    vi.mocked(getAIConfigSecure).mockResolvedValue({
      provider: 'DEEPSEEK_OCR',
      apiKey: null,
      fallbackApiKey: null,
      model: 'deepseek-ocr',
      maxTokens: 4096,
      temperature: 0.1,
      monthlyLimit: 1000,
      fallbackProvider: 'NONE',
      isConfigured: true,
    });
    vi.mocked(getSystemConfigSecure).mockResolvedValue(null);

    const mockQuery = vi.mocked(query);
    mockQuery.mockResolvedValueOnce(makeQueryResult([{ count: '0' }]));

    const result = await parseInvoiceDocumentSecure({
      fileBase64: 'A'.repeat(140),
      fileType: 'image',
      fileName: 'factura-test.png',
      locationId: '550e8400-e29b-41d4-a716-446655440222',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('DeepSeek OCR endpoint no configurado');
  });

  it('rechaza aprobar una factura si la ubicación destino sale del scope del actor', async () => {
    const clientQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        ...makeQueryResult([
          {
            id: '550e8400-e29b-41d4-a716-446655440777',
            status: 'PENDING',
            location_id: '550e8400-e29b-41d4-a716-446655440222',
            parsed_items: [],
          },
        ]),
      })
      .mockResolvedValueOnce({
        command: 'UPDATE',
        rowCount: 0,
        oid: 0,
        fields: [],
        rows: [],
      });
    const release = vi.fn();

    vi.mocked(pool.connect).mockResolvedValue({
      query: clientQuery,
      release,
    } as unknown as Awaited<ReturnType<typeof pool.connect>>);

    vi.mocked(resolveEffectiveProcurementLocation)
      .mockReturnValueOnce({
        success: true,
        locationId: '550e8400-e29b-41d4-a716-446655440222',
      })
      .mockReturnValueOnce({
        success: false,
        error: 'Acceso denegado a otra ubicación',
      });

    const result = await approveInvoiceParsingSecure({
      parsingId: '550e8400-e29b-41d4-a716-446655440777',
      destinationLocationId: '550e8400-e29b-41d4-a716-446655440999',
      createAccountPayable: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Acceso denegado');
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(release).toHaveBeenCalled();
  });

  it('rechaza obtener detalle de parsing fuera del scope del actor', async () => {
    vi.mocked(query).mockResolvedValueOnce(makeQueryResult([
      {
        id: '550e8400-e29b-41d4-a716-446655440777',
        location_id: '550e8400-e29b-41d4-a716-446655440999',
      },
    ]));
    vi.mocked(resolveEffectiveProcurementLocation).mockReturnValueOnce({
      success: false,
      error: 'Acceso denegado a otra ubicación',
    });

    const result = await getInvoiceParsingSecure('550e8400-e29b-41d4-a716-446655440777');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Acceso denegado');
  });
});
