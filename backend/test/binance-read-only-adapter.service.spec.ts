import { BinanceReadOnlyAdapterService } from '../src/binance-adapter/binance-read-only-adapter.service';

function mockFetchOnce(response: { status: number; headers?: Record<string, string>; body: unknown }): jest.SpyInstance {
  return jest.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    headers: { get: (name: string) => response.headers?.[name.toLowerCase()] ?? null },
    json: () => Promise.resolve(response.body),
  } as unknown as Response);
}

describe('BinanceReadOnlyAdapterService', () => {
  let service: BinanceReadOnlyAdapterService;

  beforeEach(() => {
    service = new BinanceReadOnlyAdapterService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getCrossMarginAccount returns ok:true with the raw response on HTTP 200 (EV-001 fixture)', async () => {
    const fetchSpy = mockFetchOnce({
      status: 200,
      body: {
        accountType: 'MARGIN_1',
        marginLevel: '999.00',
        totalAssetOfBtc: '1.5',
        totalLiabilityOfBtc: '0.1',
        totalNetAssetOfBtc: '1.4',
        userAssets: [{ asset: 'USDT', borrowed: '0', free: '100', interest: '0', locked: '0', netAsset: '100' }],
      },
    });

    const result = await service.getCrossMarginAccount('key', 'secret');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.accountType).toBe('MARGIN_1');
      expect(typeof result.data.marginLevel).toBe('string'); // never parsed to number
    }
    // Signature/query params present, secret never sent in the URL (only used to sign).
    const calledUrl = (fetchSpy.mock.calls[0][0] as string);
    expect(calledUrl).toContain('/sapi/v1/margin/account');
    expect(calledUrl).toContain('signature=');
    expect(calledUrl).not.toContain('secret');
    const calledInit = fetchSpy.mock.calls[0][1] as RequestInit;
    expect((calledInit.headers as Record<string, string>)['X-MBX-APIKEY']).toBe('key');
  });

  it('maps a Binance error body (e.g. bad signature) to HTTP_ERROR with the binanceCode (AC-002)', async () => {
    mockFetchOnce({ status: 401, body: { code: -1022, msg: 'Signature for this request is not valid.' } });

    const result = await service.getApiKeyRestrictions('key', 'secret');

    expect(result).toMatchObject({ ok: false, kind: 'HTTP_ERROR', httpStatus: 401, binanceCode: -1022 });
  });

  it('maps HTTP 429 to a rate-limit HTTP_ERROR with retryAfterSeconds (EV-006/AC-008)', async () => {
    mockFetchOnce({ status: 429, headers: { 'retry-after': '30' }, body: { code: -1003, msg: 'Too many requests.' } });

    const result = await service.getCrossMarginAccount('key', 'secret');

    expect(result).toMatchObject({ ok: false, kind: 'HTTP_ERROR', httpStatus: 429, retryAfterSeconds: 30 });
  });

  it('maps a network failure to NETWORK_OR_TIMEOUT, never INVALID (AGENTS.md: timeout != failure)', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('fetch failed: ECONNRESET'));

    const result = await service.getCrossMarginAccount('key', 'secret');

    expect(result).toMatchObject({ ok: false, kind: 'NETWORK_OR_TIMEOUT' });
  });

  it('maps an aborted request (timeout) to NETWORK_OR_TIMEOUT', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(abortError);

    const result = await service.getCrossMarginAccount('key', 'secret');

    expect(result).toMatchObject({ ok: false, kind: 'NETWORK_OR_TIMEOUT' });
  });
});
