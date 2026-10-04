import { useEffect, useState } from 'react';
import { Button, InlineAlert, InlineStatus } from '../common';
import { getExposureSummary, ApiError } from '../../api/riskEngineClient';
import type { ExposureSummaryView } from '../../api/riskEngineTypes';
import { formatTimestamp } from './formatTimestamp';

// design/risk-engine.md mục 1 (R1 — docs/RISK_RULES.md, AC-005/AC-006/AC-007/AC-009).
export function RiskSummaryWidget() {
  const [data, setData] = useState<ExposureSummaryView | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setData(await getExposureSummary());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể tải dữ liệu rủi ro, vui lòng thử lại.');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="mb-6 rounded-xl border border-[var(--color-border)] p-4">
      <h3 className="mt-0">Rủi ro vay (tổng quan)</h3>

      {data === null && !error && <p className="text-[var(--color-text-secondary)]">Đang tải dữ liệu rủi ro...</p>}
      {error && (
        <div className="flex flex-col items-start gap-2">
          <InlineAlert>{error}</InlineAlert>
          <Button variant="secondary" onClick={load}>
            Thử lại
          </Button>
        </div>
      )}

      {data && (
        <div className="text-sm">
          <p>
            Tổng initial exposure (mọi khoản vay đang mở): <strong>{data.totalInitialExposureUsdt} USDT</strong>
          </p>

          {data.collateral.status === 'OK' && (
            <>
              <p>{data.collateral.disclaimer}</p>
              <p>Giá trị: {data.collateral.value} USDT</p>
              <p>Cap khuyến nghị (collateral/3): {data.cap} USDT</p>
              {data.collateral.fetchedAt && <p className="text-xs text-[var(--color-text-secondary)]">Dữ liệu tại {formatTimestamp(data.collateral.fetchedAt)}</p>}
              {data.overCap ? (
                <InlineAlert>
                  Tổng vay vượt cap khuyến nghị ({data.totalInitialExposureUsdt} &gt; {data.cap} USDT). Đây là cảnh báo thông
                  tin — hệ thống không tự chặn vay vì bạn tự thực hiện vay trên Binance.
                </InlineAlert>
              ) : (
                <InlineStatus>Trong giới hạn cap khuyến nghị.</InlineStatus>
              )}
            </>
          )}

          {data.collateral.status === 'NO_VERIFIED_CONNECTION' && (
            <p className="text-[var(--color-text-secondary)]">
              Chưa có kết nối Binance đã verify — không thể tính cap. Kết nối Binance ở trang Kết nối để xem đầy đủ.
            </p>
          )}

          {data.collateral.status === 'READ_ERROR' && (
            <>
              <InlineAlert>
                Không thể đọc dữ liệu Binance để tính cap{data.collateral.errorMessage ? ` (${data.collateral.errorMessage})` : ''}.
                Chưa đọc được khác với an toàn — thử lại.
              </InlineAlert>
              <Button variant="secondary" onClick={load}>
                Thử lại
              </Button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
