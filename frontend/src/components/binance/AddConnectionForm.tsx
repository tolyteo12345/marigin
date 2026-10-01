import { useState, type FormEvent } from 'react';
import { Button, InlineAlert, InlineStatus, TextField } from '../common';
import { createConnection, ApiError } from '../../api/binanceConnectionClient';
import type { ConnectionView } from '../../api/binanceConnectionTypes';

interface AddConnectionFormProps {
  onCreated: (connection: ConnectionView) => void;
}

// design/binance-read-only-connection.md mục 2. Verify chạy đồng bộ trong
// cùng request tạo (không có bước "đang lưu" tách biệt "đang verify") — lỗi
// verify (INVALID/UNSUPPORTED_ACCOUNT_MODE/...) hiển thị ở ConnectionStatusCard
// của connection mới, không phải ở form này.
export function AddConnectionForm({ onCreated }: AddConnectionFormProps) {
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const connection = await createConnection(label.trim(), apiKey.trim(), apiSecret.trim());
      setApiKey('');
      setApiSecret('');
      onCreated(connection);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể tạo kết nối, vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4">
      <TextField label="Tên gợi nhớ" value={label} onChange={(e) => setLabel(e.target.value)} required disabled={submitting} />
      <TextField label="API Key" type="text" value={apiKey} onChange={(e) => setApiKey(e.target.value)} required disabled={submitting} />
      <TextField
        label="API Secret"
        type="password"
        value={apiSecret}
        onChange={(e) => setApiSecret(e.target.value)}
        required
        disabled={submitting}
      />
      <p className="text-xs text-[var(--color-text-secondary)]">
        Chỉ nhập API key có quyền đọc (Enable Reading). Không bật Enable Spot &amp; Margin Trading hoặc Enable
        Withdrawals nếu không cần.
      </p>
      {submitting && <InlineStatus>Đang xác minh kết nối...</InlineStatus>}
      {error && <InlineAlert>{error}</InlineAlert>}
      <Button type="submit" disabled={submitting} className="mt-2">
        Thêm kết nối
      </Button>
    </form>
  );
}
