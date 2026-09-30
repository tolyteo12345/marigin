import { useState } from 'react';
import { Button, InlineAlert, InlineStatus } from '../common';
import { revokeConnection, ApiError } from '../../api/binanceConnectionClient';

interface RevokeConnectionButtonProps {
  connectionId: string;
  label: string;
  onRevoked: (connectionId: string) => void;
}

// design/binance-read-only-connection.md mục 5. UX confirm only (không phải
// financial confirm) — pattern giống LogoutButton của user-authentication.
export function RevokeConnectionButton({ connectionId, label, onRevoked }: RevokeConnectionButtonProps) {
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleClick() {
    const confirmed = window.confirm(`Xoá kết nối '${label}'? Hệ thống sẽ ngừng dùng key này ngay lập tức và không thể hoàn tác.`);
    if (!confirmed) {
      return;
    }
    setRevoking(true);
    setError(null);
    try {
      await revokeConnection(connectionId);
      setDone(true);
      onRevoked(connectionId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể xoá kết nối, vui lòng thử lại.');
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div>
      <Button variant="secondary" onClick={handleClick} disabled={revoking}>
        Xoá kết nối
      </Button>
      {done && <InlineStatus>Đã xoá kết nối.</InlineStatus>}
      {error && <InlineAlert>{error}</InlineAlert>}
    </div>
  );
}
