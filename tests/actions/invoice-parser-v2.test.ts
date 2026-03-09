import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPendingParsingsSecure, parseInvoiceDocumentSecure, searchProductsForMappingSecure } from '@/actions/invoice-parser-v2';
import { query } from '@/lib/db';
import { getAIConfigSecure, getSystemConfigSecure } from '@/actions/config-v2';

vi.mock('@/lib/db', () => ({
  pool: { connect: vi.fn() },
  query: vi.fn(),
}));

vi.mock('@/actions/config-v2', () => ({
  getAIConfigSecure: vi.fn(),
  getSystemConfigSecure: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Map([
    ['x-user-id', '550e8400-e29b-41d4-a716-446655440111'],
    ['x-user-role', 'ADMIN'],
    ['x-user-location', '550e8400-e29b-41d4-a716-446655440222'],
  ])),
}));

describe('invoice-parser-v2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aplica búsqueda con wildcard correcto y pagina con límite seguro', async () => {
    const mockQuery = vi.mocked(query);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: '1' }] } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'ip-1', supplier_name: 'Proveedor Test' }] } as any);

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
    expect(secondCallParams).toContain(100); // pageSize capped
    expect(secondCallParams).toContain(100); // offset = (2-1)*100
  });

  it('arma correctamente parámetros de búsqueda de productos para mapeo', async () => {
    const mockQuery = vi.mocked(query);
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);

    const result = await searchProductsForMappingSecure('PARA_500', 10);

    expect(result.success).toBe(true);
    const params = mockQuery.mock.calls[0]?.[1] as unknown[];
    expect(params[0]).toBe('%PARA500%');
    expect(params[1]).toBe('PARA500%');
    expect(params[2]).toBe(10);
  });

  it('permite proveedor DEEPSEEK_OCR sin API key y avanza al control de límite mensual', async () => {
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
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] } as any);

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
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] } as any);

    const result = await parseInvoiceDocumentSecure({
      fileBase64: 'A'.repeat(140),
      fileType: 'image',
      fileName: 'factura-test.png',
      locationId: '550e8400-e29b-41d4-a716-446655440222',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('DeepSeek OCR endpoint no configurado');
  });
});
