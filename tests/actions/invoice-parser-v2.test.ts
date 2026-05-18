import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  approveInvoiceParsingSecure,
  deleteInvoiceParsingSecure,
  getInvoiceParsingSecure,
  getPendingParsingsSecure,
  getSmartInvoiceLocationsSecure,
  parseInvoiceDocumentSecure,
  rejectInvoiceParsingSecure,
  searchProductsForMappingSecure,
} from '@/actions/invoice-parser-v2';
import { pool, query } from '@/lib/db';
import { getAIConfigSecure, getSystemConfigSecure } from '@/actions/config-v2';
import {
  requireProcurementActor,
  resolveEffectiveProcurementLocation,
} from '@/actions/procurement-scope';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

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

function makeJsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function expectSmartInvoiceAuditCall(
  call:
    | [text: string, params?: (string | number | boolean | Date | string[] | null | undefined)[]]
    | undefined,
  expected: {
    actionCode: string;
    parsingId: string;
    locationId: string | null;
    fromStatus: string | null;
    toStatus: string | null;
    metadata: Record<string, unknown>;
  },
) {
  expect(call).toBeTruthy();

  const [, params] = call!;
  const values = (params || []) as unknown[];

  expect(values[3]).toBe(expected.locationId);
  expect(values[4]).toBe(expected.actionCode);
  expect(values[5]).toBe(expected.parsingId);
  expect(values[6] ? JSON.parse(String(values[6])) : null).toEqual(
    expected.fromStatus ? { status: expected.fromStatus } : null,
  );
  expect(values[7] ? JSON.parse(String(values[7])) : null).toEqual(
    expected.toStatus ? { status: expected.toStatus } : null,
  );
  expect(JSON.parse(String(values[8]))).toEqual(expected.metadata);
}

describe('invoice-parser-v2', () => {
  beforeEach(() => {
    vi.resetAllMocks();

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

  it('usa joins read-side compatibles con ids uuid/text en listado de parsings', async () => {
    const mockQuery = vi.mocked(query);
    mockQuery
      .mockResolvedValueOnce(makeQueryResult([{ total: '1' }]))
      .mockResolvedValueOnce(makeQueryResult([{ id: 'ip-1', supplier_name: 'Proveedor Test' }]));

    const result = await getPendingParsingsSecure({ page: 1, pageSize: 20 });

    expect(result.success).toBe(true);
    const listSql = String(mockQuery.mock.calls[1]?.[0] || '');
    expect(listSql).toContain('ip.created_by::text = u.id::text');
    expect(listSql).toContain('ip.location_id::text = l.id::text');
  });

  it('usa joins read-side compatibles con ids uuid/text en detalle de parsing', async () => {
    const mockQuery = vi.mocked(query);
    mockQuery.mockResolvedValueOnce(makeQueryResult([
      {
        id: '550e8400-e29b-41d4-a716-446655440999',
        location_id: scopedActor.locationId,
      },
    ]));

    const result = await getInvoiceParsingSecure('550e8400-e29b-41d4-a716-446655440999');

    expect(result.success).toBe(true);
    const detailSql = String(mockQuery.mock.calls[0]?.[0] || '');
    expect(detailSql).toContain('ip.supplier_id::text = s.id::text');
    expect(detailSql).toContain('ip.created_by::text = u.id::text');
    expect(detailSql).toContain('ip.validated_by::text = vu.id::text');
    expect(detailSql).toContain('ip.location_id::text = l.id::text');
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
    const originalAppUrl = process.env.APP_URL;
    const originalPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;

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

    try {
      const result = await parseInvoiceDocumentSecure({
        fileBase64: 'A'.repeat(140),
        fileType: 'image',
        fileName: 'factura-test.png',
        locationId: '550e8400-e29b-41d4-a716-446655440222',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('DeepSeek OCR endpoint no configurado');
    } finally {
      if (originalAppUrl === undefined) {
        delete process.env.APP_URL;
      } else {
        process.env.APP_URL = originalAppUrl;
      }

      if (originalPublicAppUrl === undefined) {
        delete process.env.NEXT_PUBLIC_APP_URL;
      } else {
        process.env.NEXT_PUBLIC_APP_URL = originalPublicAppUrl;
      }
    }
  });

  it('persiste un parsing exitoso con lock de archivo y sin side effects previos de proveedor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeJsonResponse({
        data: {
          confidence: 0.94,
          document_type: 'FACTURA',
          invoice_number: 'FAC-300',
          supplier: {
            name: 'Proveedor Demo',
          },
          dates: {
            issue_date: '2026-04-15',
          },
          totals: {
            net: 1000,
            tax: 190,
            total: 1190,
            discount: 0,
          },
          items: [],
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

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
    vi.mocked(getSystemConfigSecure).mockResolvedValue('https://ocr.example.com/parse');

    const mockQuery = vi.mocked(query);
    mockQuery
      .mockResolvedValueOnce(makeQueryResult([{ count: '0' }]))
      .mockResolvedValueOnce(makeQueryResult([{ is_duplicate: false, duplicate_id: null, duplicate_status: null, match_type: null }]))
      .mockResolvedValueOnce(makeQueryResult([]))
      .mockResolvedValueOnce(makeQueryResult([]))
      .mockResolvedValueOnce(makeQueryResult([]));

    const clientQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ pg_advisory_xact_lock: null }], rowCount: 1 })
      .mockResolvedValueOnce(makeQueryResult([{ is_duplicate: false, duplicate_id: null, duplicate_status: null, match_type: null }]))
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const release = vi.fn();

    vi.mocked(pool.connect).mockResolvedValue({
      query: clientQuery,
      release,
    } as unknown as Awaited<ReturnType<typeof pool.connect>>);

    const result = await parseInvoiceDocumentSecure({
      fileBase64: 'A'.repeat(140),
      fileType: 'image',
      fileName: 'factura-ok.png',
      locationId: '550e8400-e29b-41d4-a716-446655440222',
    });

    expect(result.success).toBe(true);
    expect(result.parsingId).toBeTruthy();
    expect(result.data?.invoice_number).toBe('FAC-300');
    expect(release).toHaveBeenCalled();
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO invoice_parsings'))).toBe(true);
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO suppliers'))).toBe(false);
  });

  it('no reenvía la API key de proveedor cuando usa el OCR interno', async () => {
    const originalAppUrl = process.env.APP_URL;
    const originalToken = process.env.AI_INTERNAL_ENDPOINT_TOKEN;
    process.env.APP_URL = 'https://app.example.com';
    process.env.AI_INTERNAL_ENDPOINT_TOKEN = 'internal-secret';

    const fetchMock = vi.fn().mockResolvedValue(
      makeJsonResponse({
        data: {
          confidence: 0.94,
          document_type: 'FACTURA',
          invoice_number: 'FAC-303',
          supplier: {
            name: 'Proveedor Demo',
          },
          dates: {
            issue_date: '2026-04-15',
          },
          totals: {
            net: 1000,
            tax: 190,
            total: 1190,
            discount: 0,
          },
          items: [],
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    try {
      vi.mocked(getAIConfigSecure).mockResolvedValue({
        provider: 'DEEPSEEK_OCR',
        apiKey: 'deepseek-provider-key',
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
      mockQuery
        .mockResolvedValueOnce(makeQueryResult([{ count: '0' }]))
        .mockResolvedValueOnce(makeQueryResult([{ is_duplicate: false, duplicate_id: null, duplicate_status: null, match_type: null }]))
        .mockResolvedValueOnce(makeQueryResult([]))
        .mockResolvedValueOnce(makeQueryResult([]))
        .mockResolvedValueOnce(makeQueryResult([]));

      const clientQuery = vi.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ pg_advisory_xact_lock: null }], rowCount: 1 })
        .mockResolvedValueOnce(makeQueryResult([{ is_duplicate: false, duplicate_id: null, duplicate_status: null, match_type: null }]))
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const release = vi.fn();

      vi.mocked(pool.connect).mockResolvedValue({
        query: clientQuery,
        release,
      } as unknown as Awaited<ReturnType<typeof pool.connect>>);

      const result = await parseInvoiceDocumentSecure({
        fileBase64: 'A'.repeat(140),
        fileType: 'image',
        fileName: 'factura-interna.png',
        locationId: '550e8400-e29b-41d4-a716-446655440222',
      });

      expect(result.success).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const call = fetchMock.mock.calls[0];
      expect(call?.[0]).toBe('https://app.example.com/api/ai/deepseek-ocr');

      const headers = call?.[1]?.headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
      expect(headers['x-internal-ocr-token']).toBe('internal-secret');
    } finally {
      if (originalAppUrl === undefined) {
        delete process.env.APP_URL;
      } else {
        process.env.APP_URL = originalAppUrl;
      }

      if (originalToken === undefined) {
        delete process.env.AI_INTERNAL_ENDPOINT_TOKEN;
      } else {
        process.env.AI_INTERNAL_ENDPOINT_TOKEN = originalToken;
      }
    }
  });

  it('si el parse falla deja el registro en ERROR con auditoría consistente', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeJsonResponse({
        data: {
          error: true,
          message: 'Documento ilegible',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

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
    vi.mocked(getSystemConfigSecure).mockResolvedValue('https://ocr.example.com/parse');

    const mockQuery = vi.mocked(query);
    mockQuery
      .mockResolvedValueOnce(makeQueryResult([{ count: '0' }]))
      .mockResolvedValueOnce(makeQueryResult([{ is_duplicate: false, duplicate_id: null, duplicate_status: null, match_type: null }]))
      .mockResolvedValueOnce(makeQueryResult([]))
      .mockResolvedValueOnce(makeQueryResult([]))
      .mockResolvedValueOnce({ command: 'INSERT', rowCount: 1, oid: 0, fields: [], rows: [] })
      .mockResolvedValueOnce(makeQueryResult([]));

    const result = await parseInvoiceDocumentSecure({
      fileBase64: 'A'.repeat(140),
      fileType: 'image',
      fileName: 'factura-error.png',
      locationId: '550e8400-e29b-41d4-a716-446655440222',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Documento ilegible');

    const errorInsertCall = mockQuery.mock.calls.find(
      ([sql]) => String(sql).includes('INSERT INTO invoice_parsings') && String(sql).includes("status = 'ERROR'"),
    );
    expect(errorInsertCall).toBeTruthy();

    const failedAuditCall = mockQuery.mock.calls.find(
      ([sql, params]) =>
        String(sql).includes('INSERT INTO audit_log') &&
        Array.isArray(params) &&
        params[4] === 'INVOICE_PARSE_FAILED',
    );
    expectSmartInvoiceAuditCall(failedAuditCall, {
      actionCode: 'INVOICE_PARSE_FAILED',
      parsingId: String(result.parsingId),
      locationId: '550e8400-e29b-41d4-a716-446655440222',
      fromStatus: null,
      toStatus: 'ERROR',
      metadata: {
        module: 'smart-invoice',
        source: 'invoice-parser-v2',
        action: 'INVOICE_PARSE_FAILED',
        actorUserId: scopedActor.userId,
        actorRole: scopedActor.role,
        locationId: '550e8400-e29b-41d4-a716-446655440222',
        parsingId: String(result.parsingId),
        fromStatus: null,
        toStatus: 'ERROR',
        error: 'Documento ilegible',
        fileType: 'image',
      },
    });
  });

  it('bloquea duplicados semánticos antes de persistir un segundo parsing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeJsonResponse({
        data: {
          confidence: 0.91,
          document_type: 'FACTURA',
          invoice_number: 'FAC-301',
          supplier: {
            rut: '12.345.678-5',
            name: 'Proveedor Demo',
          },
          dates: {
            issue_date: '2026-04-15',
          },
          totals: {
            net: 1000,
            tax: 190,
            total: 1190,
            discount: 0,
          },
          items: [],
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

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
    vi.mocked(getSystemConfigSecure).mockResolvedValue('https://ocr.example.com/parse');

    const mockQuery = vi.mocked(query);
    mockQuery
      .mockResolvedValueOnce(makeQueryResult([{ count: '0' }]))
      .mockResolvedValueOnce(makeQueryResult([{ is_duplicate: false, duplicate_id: null, duplicate_status: null, match_type: null }]))
      .mockResolvedValueOnce(makeQueryResult([]))
      .mockResolvedValueOnce(makeQueryResult([]))
      .mockResolvedValueOnce(makeQueryResult([
        {
          is_duplicate: true,
          duplicate_id: '550e8400-e29b-41d4-a716-446655440930',
          duplicate_status: 'COMPLETED',
          match_type: 'INVOICE_NUMBER',
        },
      ]))
      .mockResolvedValueOnce(makeQueryResult([]));

    const result = await parseInvoiceDocumentSecure({
      fileBase64: 'A'.repeat(140),
      fileType: 'image',
      fileName: 'factura-duplicada.png',
      locationId: '550e8400-e29b-41d4-a716-446655440222',
    });

    expect(result.success).toBe(false);
    expect(result.isDuplicate).toBe(true);
    expect(result.duplicateId).toBe('550e8400-e29b-41d4-a716-446655440930');
    expect(result.error).toContain('mismo proveedor y folio');
    expect(vi.mocked(pool.connect)).not.toHaveBeenCalled();
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO invoice_parsings'))).toBe(false);
  });

  it('bloquea reprocess si ya existe un parsing activo del mismo archivo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeJsonResponse({
        data: {
          confidence: 0.9,
          document_type: 'FACTURA',
          invoice_number: 'FAC-302',
          supplier: {
            name: 'Proveedor Demo',
          },
          dates: {
            issue_date: '2026-04-15',
          },
          totals: {
            net: 1000,
            tax: 190,
            total: 1190,
            discount: 0,
          },
          items: [],
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

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
    vi.mocked(getSystemConfigSecure).mockResolvedValue('https://ocr.example.com/parse');

    const mockQuery = vi.mocked(query);
    mockQuery
      .mockResolvedValueOnce(makeQueryResult([{ count: '0' }]))
      .mockResolvedValueOnce(makeQueryResult([]))
      .mockResolvedValueOnce(makeQueryResult([]))
      .mockResolvedValueOnce(makeQueryResult([]))
      .mockResolvedValueOnce(makeQueryResult([]));

    const clientQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ pg_advisory_xact_lock: null }], rowCount: 1 })
      .mockResolvedValueOnce(makeQueryResult([
        {
          is_duplicate: true,
          duplicate_id: '550e8400-e29b-41d4-a716-446655440931',
          duplicate_status: 'PROCESSING',
          match_type: 'FILE_HASH',
        },
      ]))
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const release = vi.fn();

    vi.mocked(pool.connect).mockResolvedValue({
      query: clientQuery,
      release,
    } as unknown as Awaited<ReturnType<typeof pool.connect>>);

    const result = await parseInvoiceDocumentSecure({
      fileBase64: 'A'.repeat(140),
      fileType: 'image',
      fileName: 'factura-retry.png',
      locationId: '550e8400-e29b-41d4-a716-446655440222',
      allowDuplicate: true,
    });

    expect(result.success).toBe(false);
    expect(result.isDuplicate).toBe(true);
    expect(result.error).toContain('parsing activo');
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO invoice_parsings'))).toBe(false);
    expect(release).toHaveBeenCalled();
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
    vi.mocked(query).mockResolvedValue(makeQueryResult([
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

  it('bloquea aprobar un parsing ya completado', async () => {
    const clientQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce(makeQueryResult([
        {
          id: '550e8400-e29b-41d4-a716-446655440888',
          status: 'COMPLETED',
          location_id: '550e8400-e29b-41d4-a716-446655440222',
          parsed_items: [],
        },
      ]))
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const release = vi.fn();

    vi.mocked(pool.connect).mockResolvedValue({
      query: clientQuery,
      release,
    } as unknown as Awaited<ReturnType<typeof pool.connect>>);

    const result = await approveInvoiceParsingSecure({
      parsingId: '550e8400-e29b-41d4-a716-446655440888',
      createAccountPayable: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('COMPLETED');
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(release).toHaveBeenCalled();
    expect(vi.mocked(query)).not.toHaveBeenCalled();
  });

  it('bloquea aprobar un parsing sin items procesables', async () => {
    const clientQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce(makeQueryResult([
        {
          id: '550e8400-e29b-41d4-a716-446655440889',
          status: 'PENDING',
          location_id: '550e8400-e29b-41d4-a716-446655440222',
          parsed_items: [],
        },
      ]))
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
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
        success: true,
        locationId: '550e8400-e29b-41d4-a716-446655440222',
      });

    const result = await approveInvoiceParsingSecure({
      parsingId: '550e8400-e29b-41d4-a716-446655440889',
      createAccountPayable: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('no contiene items');
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(release).toHaveBeenCalled();
  });

  it('finaliza una aprobación válida en estado COMPLETED', async () => {
    const parsingId = '550e8400-e29b-41d4-a716-446655440890';
    const mappedItem = {
      line_number: 1,
      supplier_sku: 'SUP-1',
      description: 'Producto Test',
      quantity: 5,
      unit_cost: 1200,
      total_cost: 6000,
      mapped_product_id: '550e8400-e29b-41d4-a716-446655440891',
      mapped_product_name: 'Producto Test',
      mapping_status: 'MAPPED',
    };

    const clientQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce(makeQueryResult([
        {
          id: parsingId,
          status: 'PENDING',
          location_id: '550e8400-e29b-41d4-a716-446655440222',
          parsed_items: [mappedItem],
          supplier_rut: null,
          total_amount: null,
          invoice_number: 'FAC-100',
          document_type: 'FACTURA',
        },
      ]))
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce(makeQueryResult([
        {
          sku: 'PROD-1',
          name: 'Producto Test',
        },
      ]))
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const release = vi.fn();

    vi.mocked(pool.connect).mockResolvedValue({
      query: clientQuery,
      release,
    } as unknown as Awaited<ReturnType<typeof pool.connect>>);

    const result = await approveInvoiceParsingSecure({
      parsingId,
      createAccountPayable: false,
    });

    expect(result.success).toBe(true);
    expect(result.mappedCount).toBe(1);
    expect(result.unmappedCount).toBe(0);
    expect(result.stockCreated).toBe(1);

    const finalUpdateCall = clientQuery.mock.calls.find(
      ([sql, params]) =>
        typeof sql === 'string' &&
        sql.includes('UPDATE invoice_parsings SET') &&
        Array.isArray(params) &&
        params[0] === 'COMPLETED',
    );

    expect(finalUpdateCall).toBeTruthy();
    expect(release).toHaveBeenCalled();
  });

  it('bloquea rechazar un parsing ya completado', async () => {
    vi.mocked(query).mockResolvedValueOnce(makeQueryResult([
      {
        status: 'COMPLETED',
        location_id: '550e8400-e29b-41d4-a716-446655440222',
      },
    ]));

    const result = await rejectInvoiceParsingSecure(
      '550e8400-e29b-41d4-a716-446655440892',
      'Factura ya cerrada',
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('COMPLETED');
    expect(vi.mocked(query)).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(query).mock.calls.some(([sql]) => String(sql).includes('INSERT INTO audit_log')),
    ).toBe(false);
  });

  it('bloquea rechazar un parsing en PROCESSING para no cerrar un flujo intermedio', async () => {
    vi.mocked(query).mockResolvedValueOnce(makeQueryResult([
      {
        status: 'PROCESSING',
        location_id: '550e8400-e29b-41d4-a716-446655440222',
      },
    ]));

    const result = await rejectInvoiceParsingSecure(
      '550e8400-e29b-41d4-a716-446655440898',
      'No debe cerrarse en pleno procesamiento',
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('PROCESSING');
    expect(
      vi.mocked(query).mock.calls.some(([sql]) => String(sql).includes('INSERT INTO audit_log')),
    ).toBe(false);
  });

  it('bloquea eliminar un parsing ya completado', async () => {
    vi.mocked(query).mockResolvedValueOnce(makeQueryResult([
      {
        status: 'COMPLETED',
        location_id: '550e8400-e29b-41d4-a716-446655440222',
      },
    ]));

    const result = await deleteInvoiceParsingSecure('550e8400-e29b-41d4-a716-446655440893');

    expect(result.success).toBe(false);
    expect(result.error).toContain('COMPLETED');
    expect(vi.mocked(query)).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(query).mock.calls.some(([sql]) => String(sql).includes('INSERT INTO audit_log')),
    ).toBe(false);
  });

  it('permite eliminar un parsing rechazado sin reabrir estados cerrados', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce(makeQueryResult([
        {
          status: 'REJECTED',
          location_id: '550e8400-e29b-41d4-a716-446655440222',
        },
      ]))
      .mockResolvedValueOnce({
        command: 'DELETE',
        rowCount: 1,
        oid: 0,
        fields: [],
        rows: [],
      });

    const result = await deleteInvoiceParsingSecure('550e8400-e29b-41d4-a716-446655440894');

    expect(result.success).toBe(true);
    expect(vi.mocked(query)).toHaveBeenNthCalledWith(
      2,
      'DELETE FROM invoice_parsings WHERE id = $1 AND status = $2',
      ['550e8400-e29b-41d4-a716-446655440894', 'REJECTED'],
    );

    const auditCall = vi
      .mocked(query)
      .mock.calls.find(([sql]) => String(sql).includes('INSERT INTO audit_log'));

    expectSmartInvoiceAuditCall(auditCall, {
      actionCode: 'INVOICE_DELETED',
      parsingId: '550e8400-e29b-41d4-a716-446655440894',
      locationId: '550e8400-e29b-41d4-a716-446655440222',
      fromStatus: 'REJECTED',
      toStatus: 'DELETED',
      metadata: {
        module: 'smart-invoice',
        source: 'invoice-parser-v2',
        action: 'INVOICE_DELETED',
        actorUserId: scopedActor.userId,
        actorRole: scopedActor.role,
        locationId: '550e8400-e29b-41d4-a716-446655440222',
        parsingId: '550e8400-e29b-41d4-a716-446655440894',
        fromStatus: 'REJECTED',
        toStatus: 'DELETED',
      },
    });
  });

  it('audita una aprobación válida con transición mínima estable', async () => {
    const parsingId = '550e8400-e29b-41d4-a716-446655440895';
    const mappedItem = {
      line_number: 1,
      supplier_sku: 'SUP-1',
      description: 'Producto Test',
      quantity: 5,
      unit_cost: 1200,
      total_cost: 6000,
      mapped_product_id: '550e8400-e29b-41d4-a716-446655440896',
      mapped_product_name: 'Producto Test',
      mapping_status: 'MAPPED',
    };

    const clientQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce(makeQueryResult([
        {
          id: parsingId,
          status: 'PENDING',
          location_id: '550e8400-e29b-41d4-a716-446655440222',
          parsed_items: [mappedItem],
          supplier_rut: null,
          total_amount: null,
          invoice_number: 'FAC-200',
          document_type: 'FACTURA',
        },
      ]))
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce(makeQueryResult([
        {
          sku: 'PROD-1',
          name: 'Producto Test',
        },
      ]))
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const release = vi.fn();

    vi.mocked(pool.connect).mockResolvedValue({
      query: clientQuery,
      release,
    } as unknown as Awaited<ReturnType<typeof pool.connect>>);
    vi.mocked(query).mockResolvedValueOnce(makeQueryResult([]));

    const result = await approveInvoiceParsingSecure({
      parsingId,
      createAccountPayable: false,
    });

    expect(result.success).toBe(true);
    const auditCall = vi.mocked(query).mock.calls[0];

    expectSmartInvoiceAuditCall(auditCall, {
      actionCode: 'INVOICE_APPROVED',
      parsingId,
      locationId: '550e8400-e29b-41d4-a716-446655440222',
      fromStatus: 'PENDING',
      toStatus: 'COMPLETED',
      metadata: {
        module: 'smart-invoice',
        source: 'invoice-parser-v2',
        action: 'INVOICE_APPROVED',
        actorUserId: scopedActor.userId,
        actorRole: scopedActor.role,
        locationId: '550e8400-e29b-41d4-a716-446655440222',
        parsingId,
        fromStatus: 'PENDING',
        toStatus: 'COMPLETED',
        sourceLocationId: '550e8400-e29b-41d4-a716-446655440222',
        destinationLocationId: '550e8400-e29b-41d4-a716-446655440222',
        supplierId: null,
        supplierCreated: false,
        accountPayableId: null,
        mappedCount: 1,
        unmappedCount: 0,
        stockCreated: 1,
      },
    });
  });

  it('audita un rechazo válido con payload mínimo estable', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce(makeQueryResult([
        {
          status: 'PENDING',
          location_id: '550e8400-e29b-41d4-a716-446655440222',
        },
      ]))
      .mockResolvedValueOnce({
        command: 'UPDATE',
        rowCount: 1,
        oid: 0,
        fields: [],
        rows: [{ id: '550e8400-e29b-41d4-a716-446655440897' }],
      })
      .mockResolvedValueOnce(makeQueryResult([]));

    const result = await rejectInvoiceParsingSecure(
      '550e8400-e29b-41d4-a716-446655440897',
      'Documento inconsistente',
    );

    expect(result.success).toBe(true);

    const auditCall = vi.mocked(query).mock.calls[2];
    expectSmartInvoiceAuditCall(auditCall, {
      actionCode: 'INVOICE_REJECTED',
      parsingId: '550e8400-e29b-41d4-a716-446655440897',
      locationId: '550e8400-e29b-41d4-a716-446655440222',
      fromStatus: 'PENDING',
      toStatus: 'REJECTED',
      metadata: {
        module: 'smart-invoice',
        source: 'invoice-parser-v2',
        action: 'INVOICE_REJECTED',
        actorUserId: scopedActor.userId,
        actorRole: scopedActor.role,
        locationId: '550e8400-e29b-41d4-a716-446655440222',
        parsingId: '550e8400-e29b-41d4-a716-446655440897',
        fromStatus: 'PENDING',
        toStatus: 'REJECTED',
        reason: 'Documento inconsistente',
      },
    });
  });
});
