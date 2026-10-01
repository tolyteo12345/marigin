import { useState } from 'react';
import { Button, InlineAlert, InlineStatus } from '../common';
import { verifyConnection, ApiError } from '../../api/binanceConnectionClient';
import type { ConnectionView } from '../../api/binanceConnectionTypes';
import { AccountSnapshotPanel } from './AccountSnapshotPanel';
import { RevokeConnectionButton } from './RevokeConnectionButton';

interface ConnectionStatusCardProps {
  connection: ConnectionView;
  onUpdated: (connection: ConnectionView) => void;
  onRevoked: (connectionId: string) => void;
}

function formatLastVerifiedAt(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC ${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

function permissionTooBroad(connection: ConnectionView): boolean {
  const p = connection.permissionSnapshot;
  return !!p && (p.enableWithdrawals || p.enableSpotAndMarginTrading || p.enableFutures);
}

// design/binance-read-only-connection.md mục 3.
export function ConnectionStatusCard({ connection, onUpdated, onRevoked }: ConnectionStatusCardProps) {
  const [reverifying, setReverifying] = useState(false);
  const [reverifyError, setReverifyError] = useState<string | null>(null);
  const [permissionWarningAcked, setPermissionWarningAcked] = useState(false);

  async function handleReverify() {
    setReverifying(true);
    setReverifyError(null);
    try {
      onUpdated(await verifyConnection(connection.id));
    } catch (err) {
      setReverifyError(err instanceof ApiError ? err.message : 'Không thể xác minh lại, vui lòng thử lại.');
    } finally {
      setReverifying(false);
    }
  }

  return (
    <div className="mt-4 flex w-full flex-col items-start gap-2 rounded-lg border border-[var(--color-border)] p-4 text-left">
      <p>
        <strong className="text-[var(--color-text-primary)]">{connection.label}</strong>
      </p>
      {connection.lastVerifiedAt && (
        <p className="text-xs text-[var(--color-text-secondary)]">
          Xác minh gần nhất: {formatLastVerifiedAt(connection.lastVerifiedAt)}
        </p>
      )}

      {connection.status === 'PENDING_VERIFY' && <InlineStatus>Đang xác minh...</InlineStatus>}

      {connection.status === 'VERIFIED' && (
        <>
          <InlineStatus>Đã xác minh — Cross Margin Classic.</InlineStatus>
          <AccountSnapshotPanel connectionId={connection.id} />
        </>
      )}

      {connection.status === 'INVALID' && (
        <InlineAlert>{connection.lastError ?? 'Kết nối không hợp lệ: API key hoặc secret sai hoặc đã hết hạn.'}</InlineAlert>
      )}

      {connection.status === 'UNSUPPORTED_ACCOUNT_MODE' && (
        <InlineAlert>{connection.lastError ?? 'Tài khoản không hỗ trợ.'}</InlineAlert>
      )}

      {connection.status === 'VERIFY_UNKNOWN' && (
        <InlineAlert>Không xác nhận được trạng thái (mất kết nối/hết thời gian chờ với Binance).</InlineAlert>
      )}

      {(connection.status === 'INVALID' || connection.status === 'UNSUPPORTED_ACCOUNT_MODE' || connection.status === 'VERIFY_UNKNOWN') && (
        <Button variant="secondary" onClick={handleReverify} disabled={reverifying}>
          {connection.status === 'VERIFY_UNKNOWN' ? 'Thử lại' : 'Xác minh lại'}
        </Button>
      )}
      {reverifyError && <InlineAlert>{reverifyError}</InlineAlert>}

      {connection.permissionUnknown && (
        <InlineAlert>
          Không xác định được quyền của API key này (không đọc được thông tin permission từ Binance). Vui lòng tự
          kiểm tra trên Binance để đảm bảo key chỉ có quyền đọc.
        </InlineAlert>
      )}

      {permissionTooBroad(connection) && !permissionWarningAcked && (
        <>
          <InlineAlert>
            Cảnh báo: API key này có quyền vượt quá mức cần thiết. Khuyến nghị tạo lại key chỉ bật Enable Reading.
          </InlineAlert>
          <Button variant="secondary" onClick={() => setPermissionWarningAcked(true)}>
            Đã hiểu, tiếp tục
          </Button>
        </>
      )}

      <RevokeConnectionButton connectionId={connection.id} label={connection.label} onRevoked={onRevoked} />
    </div>
  );
}
