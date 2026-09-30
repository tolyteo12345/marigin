import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import { ApiKeyRestrictionsResponse, BinanceAdapterResult, CrossMarginAccountResponse } from './binance-api.types';

const BINANCE_BASE_URL = 'https://api.binance.com';
const RECV_WINDOW_MS = 5000; // default per EV-005, max 60000ms
const REQUEST_TIMEOUT_MS = 10_000;

// Safety boundary (architecture doc "Ranh giới an toàn bắt buộc"): this class
// is the ONLY place allowed to call the Binance Bot API, and it exports
// exactly these 2 methods — both GET/USER_DATA, both read-only. Do not add a
// generic "request" method here; any new Binance capability must be its own
// named, reviewed method so a mutation endpoint can never be reached through
// this adapter by accident.
@Injectable()
export class BinanceReadOnlyAdapterService {
  private readonly logger = new Logger(BinanceReadOnlyAdapterService.name);

  async getCrossMarginAccount(apiKey: string, apiSecret: string): Promise<BinanceAdapterResult<CrossMarginAccountResponse>> {
    return this.signedGet<CrossMarginAccountResponse>('/sapi/v1/margin/account', apiKey, apiSecret);
  }

  async getApiKeyRestrictions(apiKey: string, apiSecret: string): Promise<BinanceAdapterResult<ApiKeyRestrictionsResponse>> {
    return this.signedGet<ApiKeyRestrictionsResponse>('/sapi/v1/account/apiRestrictions', apiKey, apiSecret);
  }

  private sign(queryString: string, apiSecret: string): string {
    return createHmac('sha256', apiSecret).update(queryString).digest('hex');
  }

  private async signedGet<T>(path: string, apiKey: string, apiSecret: string): Promise<BinanceAdapterResult<T>> {
    const params = new URLSearchParams({
      timestamp: Date.now().toString(),
      recvWindow: RECV_WINDOW_MS.toString(),
    });
    const signature = this.sign(params.toString(), apiSecret);
    params.append('signature', signature);

    const url = `${BINANCE_BASE_URL}${path}?${params.toString()}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'X-MBX-APIKEY': apiKey },
        signal: controller.signal,
      });

      const usedWeight = response.headers.get('x-mbx-used-weight-1m') ?? undefined;

      if (response.status === 429 || response.status === 418) {
        const retryAfterHeader = response.headers.get('retry-after');
        return {
          ok: false,
          kind: 'HTTP_ERROR',
          httpStatus: response.status,
          message: 'Binance rate limit exceeded',
          retryAfterSeconds: retryAfterHeader ? Number(retryAfterHeader) : undefined,
        };
      }

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        // Binance error body shape per general-info docs: { code: number, msg: string }.
        const binanceCode = typeof body?.code === 'number' ? body.code : undefined;
        const message = typeof body?.msg === 'string' ? body.msg : `Binance returned HTTP ${response.status}`;
        return { ok: false, kind: 'HTTP_ERROR', httpStatus: response.status, binanceCode, message };
      }

      return { ok: true, data: body as T, usedWeight };
    } catch (err) {
      // Covers AbortError (timeout) and any network-level failure (DNS, TLS,
      // connection refused/reset) — all must map to VERIFY_UNKNOWN upstream,
      // never to INVALID (AGENTS.md "timeout không đồng nghĩa thất bại").
      const message = (err as Error).message;
      this.logger.warn(`Binance call to ${path} failed: ${message}`);
      return { ok: false, kind: 'NETWORK_OR_TIMEOUT', message };
    } finally {
      clearTimeout(timeout);
    }
  }
}
