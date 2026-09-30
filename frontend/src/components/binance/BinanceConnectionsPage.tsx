import { useEffect, useState } from 'react';
import { Button, InlineAlert } from '../common';
import { listConnections, ApiError } from '../../api/binanceConnectionClient';
import type { ConnectionView } from '../../api/binanceConnectionTypes';
import { AddConnectionForm } from './AddConnectionForm';
import { ConnectionStatusCard } from './ConnectionStatusCard';

// design/binance-read-only-connection.md mục 1.
export function BinanceConnectionsPage() {
  const [connections, setConnections] = useState<ConnectionView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setConnections(await listConnections());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể tải danh sách kết nối, vui lòng thử lại.');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function handleCreated(connection: ConnectionView) {
    setConnections((prev) => [connection, ...(prev ?? [])]);
  }

  function handleUpdated(connection: ConnectionView) {
    setConnections((prev) => (prev ?? []).map((c) => (c.id === connection.id ? connection : c)));
  }

  function handleRevoked(connectionId: string) {
    setConnections((prev) => (prev ?? []).filter((c) => c.id !== connectionId));
  }

  return (
    <div>
      <h2>Kết nối Binance</h2>

      {connections === null && !error && <p>Đang tải danh sách kết nối...</p>}
      {error && (
        <>
          <InlineAlert>{error}</InlineAlert>
          <Button variant="secondary" onClick={load}>
            Thử lại
          </Button>
        </>
      )}

      {connections !== null && connections.length === 0 && <p>Bạn chưa có kết nối Binance nào.</p>}

      <AddConnectionForm onCreated={handleCreated} />

      {connections?.map((connection) => (
        <ConnectionStatusCard key={connection.id} connection={connection} onUpdated={handleUpdated} onRevoked={handleRevoked} />
      ))}
    </div>
  );
}
