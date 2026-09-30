import { ForbiddenException, HttpException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../src/prisma/prisma.service';
import { SecretVaultService } from '../src/secret-vault/secret-vault.service';
import { BinanceReadOnlyAdapterService } from '../src/binance-adapter/binance-read-only-adapter.service';
import { ConnectionAuditService } from '../src/connection-audit/connection-audit.service';
import { BinanceConnectionService } from '../src/binance-connection/binance-connection.service';
import { BinanceConnection } from '@prisma/client';

function makeConnection(overrides: Partial<BinanceConnection> = {}): BinanceConnection {
  return {
    id: 'conn-1',
    userId: 'user-a',
    label: 'Main',
    encryptedApiKey: Buffer.from('enc-key'),
    encryptedApiSecret: Buffer.from('enc-secret'),
    encryptionIv: Buffer.from('iv-key'),
    encryptionIvApiSecret: Buffer.from('iv-secret'),
    encryptionKeyVersion: 1,
    status: 'PENDING_VERIFY',
    accountType: null,
    permissionSnapshot: null,
    permissionUnknown: false,
    lastError: null,
    lastVerifiedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('BinanceConnectionService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let secretVault: DeepMockProxy<SecretVaultService>;
  let adapter: DeepMockProxy<BinanceReadOnlyAdapterService>;
  let audit: DeepMockProxy<ConnectionAuditService>;
  let service: BinanceConnectionService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    secretVault = mockDeep<SecretVaultService>();
    adapter = mockDeep<BinanceReadOnlyAdapterService>();
    audit = mockDeep<ConnectionAuditService>();

    secretVault.decrypt.mockImplementation((payload) => `decrypted:${payload.ciphertext.toString()}`);

    (prisma.$transaction as unknown as jest.Mock).mockImplementation((cb: (tx: PrismaService) => unknown) => cb(prisma));
    (prisma.$queryRaw as unknown as jest.Mock).mockResolvedValue([{ locked: true }]);

    service = new BinanceConnectionService(prisma, secretVault, adapter, audit);
  });

  describe('verify — account mode classification', () => {
    it('AC-001: accountType=MARGIN_1 -> VERIFIED, and stores a successful permission snapshot', async () => {
      const connection = makeConnection();
      prisma.binanceConnection.findFirst.mockResolvedValueOnce(connection);
      adapter.getCrossMarginAccount.mockResolvedValueOnce({
        ok: true,
        data: { accountType: 'MARGIN_1', marginLevel: '999', totalAssetOfBtc: '1', totalLiabilityOfBtc: '0', totalNetAssetOfBtc: '1', userAssets: [], created: true, borrowEnabled: true, collateralMarginLevel: '999', totalCollateralValueInUSDT: '1', tradeEnabled: true, transferInEnabled: true, transferOutEnabled: true },
      });
      adapter.getApiKeyRestrictions.mockResolvedValueOnce({
        ok: true,
        data: { ipRestrict: false, enableReading: true, enableMargin: true, enableSpotAndMarginTrading: false, enableWithdrawals: false, enableInternalTransfer: false, enableFutures: false, enableVanillaOptions: false, enablePortfolioMarginTrading: false },
      });
      (prisma.binanceConnection.update as unknown as jest.Mock).mockImplementationOnce(({ data }: { data: Partial<BinanceConnection> }) => Promise.resolve({ ...connection, ...data }));

      const result = await service.verify('user-a', 'conn-1');

      expect(result.status).toBe('VERIFIED');
      expect(result.accountType).toBe('MARGIN_1');
      expect(prisma.binanceConnection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'VERIFIED', permissionUnknown: false }),
        }),
      );
    });

    it('AC-002: auth/signature error -> INVALID, never a plain exception (AGENTS.md: no crash)', async () => {
      const connection = makeConnection();
      prisma.binanceConnection.findFirst.mockResolvedValueOnce(connection);
      adapter.getCrossMarginAccount.mockResolvedValueOnce({ ok: false, kind: 'HTTP_ERROR', httpStatus: 401, binanceCode: -1022, message: 'Signature invalid' });
      (prisma.binanceConnection.update as unknown as jest.Mock).mockImplementationOnce(({ data }: { data: Partial<BinanceConnection> }) => Promise.resolve({ ...connection, ...data }));

      const result = await service.verify('user-a', 'conn-1');

      expect(result.status).toBe('INVALID');
      expect(adapter.getApiKeyRestrictions).not.toHaveBeenCalled(); // never checks permissions on an invalid key
    });

    it('AC-003a: accountType=MARGIN_2 -> UNSUPPORTED_ACCOUNT_MODE with the "Pro" message (COND-002)', async () => {
      const connection = makeConnection();
      prisma.binanceConnection.findFirst.mockResolvedValueOnce(connection);
      adapter.getCrossMarginAccount.mockResolvedValueOnce({
        ok: true,
        data: { accountType: 'MARGIN_2', marginLevel: '999', totalAssetOfBtc: '1', totalLiabilityOfBtc: '0', totalNetAssetOfBtc: '1', userAssets: [], created: true, borrowEnabled: true, collateralMarginLevel: '999', totalCollateralValueInUSDT: '1', tradeEnabled: true, transferInEnabled: true, transferOutEnabled: true },
      });
      (prisma.binanceConnection.update as unknown as jest.Mock).mockImplementationOnce(({ data }: { data: Partial<BinanceConnection> }) => Promise.resolve({ ...connection, ...data }));

      const result = await service.verify('user-a', 'conn-1');

      expect(result.status).toBe('UNSUPPORTED_ACCOUNT_MODE');
      expect(result.lastError).toContain('Cross Margin Pro');
    });

    it('AC-003b: a non-auth Binance error -> UNSUPPORTED_ACCOUNT_MODE with a DIFFERENT message ("chưa mở") than AC-003a', async () => {
      const connection = makeConnection();
      prisma.binanceConnection.findFirst.mockResolvedValueOnce(connection);
      adapter.getCrossMarginAccount.mockResolvedValueOnce({ ok: false, kind: 'HTTP_ERROR', httpStatus: 400, binanceCode: -3020, message: 'Margin account is not enabled' });
      (prisma.binanceConnection.update as unknown as jest.Mock).mockImplementationOnce(({ data }: { data: Partial<BinanceConnection> }) => Promise.resolve({ ...connection, ...data }));

      const result = await service.verify('user-a', 'conn-1');

      expect(result.status).toBe('UNSUPPORTED_ACCOUNT_MODE');
      expect(result.lastError).toContain('chưa mở Cross Margin');
      expect(result.lastError).not.toContain('Pro'); // COND-002: the 2 branches must not share 1 message
    });

    it('AC-008: network/timeout -> VERIFY_UNKNOWN, NEVER mapped to INVALID', async () => {
      const connection = makeConnection();
      prisma.binanceConnection.findFirst.mockResolvedValueOnce(connection);
      adapter.getCrossMarginAccount.mockResolvedValueOnce({ ok: false, kind: 'NETWORK_OR_TIMEOUT', message: 'timeout' });
      (prisma.binanceConnection.update as unknown as jest.Mock).mockImplementationOnce(({ data }: { data: Partial<BinanceConnection> }) => Promise.resolve({ ...connection, ...data }));

      const result = await service.verify('user-a', 'conn-1');

      expect(result.status).toBe('VERIFY_UNKNOWN');
      expect(result.status).not.toBe('INVALID');
    });

    it('AC-004 (COND-003): permission check failure sets permissionUnknown=true, fail-closed, even though the account itself verified', async () => {
      const connection = makeConnection();
      prisma.binanceConnection.findFirst.mockResolvedValueOnce(connection);
      adapter.getCrossMarginAccount.mockResolvedValueOnce({
        ok: true,
        data: { accountType: 'MARGIN_1', marginLevel: '999', totalAssetOfBtc: '1', totalLiabilityOfBtc: '0', totalNetAssetOfBtc: '1', userAssets: [], created: true, borrowEnabled: true, collateralMarginLevel: '999', totalCollateralValueInUSDT: '1', tradeEnabled: true, transferInEnabled: true, transferOutEnabled: true },
      });
      adapter.getApiKeyRestrictions.mockResolvedValueOnce({ ok: false, kind: 'NETWORK_OR_TIMEOUT', message: 'timeout' });
      (prisma.binanceConnection.update as unknown as jest.Mock).mockImplementationOnce(({ data }: { data: Partial<BinanceConnection> }) => Promise.resolve({ ...connection, ...data }));

      const result = await service.verify('user-a', 'conn-1');

      expect(result.status).toBe('VERIFIED');
      expect(result.permissionUnknown).toBe(true);
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'PERMISSION_CHECK_FAILED' }));
    });

    it('concurrency: a second verify while one is in flight for the same connection does not call Binance again', async () => {
      const connection = makeConnection();
      prisma.binanceConnection.findFirst.mockResolvedValueOnce(connection);
      (prisma.$queryRaw as unknown as jest.Mock).mockResolvedValueOnce([{ locked: false }]);

      const result = await service.verify('user-a', 'conn-1');

      expect(result).toBe(connection);
      expect(adapter.getCrossMarginAccount).not.toHaveBeenCalled();
      expect(prisma.binanceConnection.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the connection does not belong to the requesting user (AC-006, ownership)', async () => {
      prisma.binanceConnection.findFirst.mockResolvedValueOnce(null);
      await expect(service.verify('user-b', 'conn-1')).rejects.toThrow(NotFoundException);
    });

    // Regression: a decrypt failure (e.g. BINANCE_SECRET_ENCRYPTION_KEY
    // rotated without migrating existing rows) must not surface as an
    // unhandled 500 — it is an operational problem, not proof the key is bad.
    it('maps a decrypt failure to VERIFY_UNKNOWN instead of throwing', async () => {
      const connection = makeConnection();
      prisma.binanceConnection.findFirst.mockResolvedValueOnce(connection);
      secretVault.decrypt.mockImplementationOnce(() => {
        throw new Error('Unsupported state or unable to authenticate data');
      });
      (prisma.binanceConnection.update as unknown as jest.Mock).mockImplementationOnce(({ data }: { data: Partial<BinanceConnection> }) =>
        Promise.resolve({ ...connection, ...data }),
      );

      const result = await service.verify('user-a', 'conn-1');

      expect(result.status).toBe('VERIFY_UNKNOWN');
      expect(adapter.getCrossMarginAccount).not.toHaveBeenCalled();
    });
  });

  describe('revoke (AC-007)', () => {
    it('nulls out both secret fields and both IVs, sets REVOKED + deletedAt', async () => {
      prisma.binanceConnection.findFirst.mockResolvedValueOnce(makeConnection());
      prisma.binanceConnection.update.mockResolvedValueOnce(makeConnection({ status: 'REVOKED' }));

      await service.revoke('user-a', 'conn-1');

      expect(prisma.binanceConnection.update).toHaveBeenCalledWith({
        where: { id: 'conn-1' },
        data: expect.objectContaining({
          status: 'REVOKED',
          deletedAt: expect.any(Date),
          encryptedApiKey: Buffer.alloc(0),
          encryptedApiSecret: Buffer.alloc(0),
          encryptionIv: Buffer.alloc(0),
          encryptionIvApiSecret: Buffer.alloc(0),
        }),
      });
    });

    it('throws NotFoundException for a connection that is not owned by the caller', async () => {
      prisma.binanceConnection.findFirst.mockResolvedValueOnce(null);
      await expect(service.revoke('user-b', 'conn-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAccountSnapshot', () => {
    it('AC-005: returns fetchedAt + raw string fields on success, only when VERIFIED', async () => {
      const verified = makeConnection({ status: 'VERIFIED', accountType: 'MARGIN_1' });
      prisma.binanceConnection.findFirst.mockResolvedValueOnce(verified).mockResolvedValueOnce(verified);
      adapter.getCrossMarginAccount.mockResolvedValueOnce({
        ok: true,
        data: {
          accountType: 'MARGIN_1',
          marginLevel: '999.12345678',
          totalAssetOfBtc: '1.5',
          totalLiabilityOfBtc: '0.1',
          totalNetAssetOfBtc: '1.4',
          userAssets: [{ asset: 'USDT', borrowed: '0', free: '100', interest: '0', locked: '0', netAsset: '100' }],
          created: true,
          borrowEnabled: true,
          collateralMarginLevel: '999',
          totalCollateralValueInUSDT: '1',
          tradeEnabled: true,
          transferInEnabled: true,
          transferOutEnabled: true,
        },
      });

      const snapshot = await service.getAccountSnapshot('user-a', 'conn-1');

      expect(snapshot.marginLevel).toBe('999.12345678'); // never parsed to number
      expect(typeof snapshot.fetchedAt).toBe('string');
      expect(snapshot.userAssets).toHaveLength(1);
    });

    it('rejects with ForbiddenException when status is not VERIFIED', async () => {
      prisma.binanceConnection.findFirst.mockResolvedValueOnce(makeConnection({ status: 'PENDING_VERIFY' }));
      await expect(service.getAccountSnapshot('user-a', 'conn-1')).rejects.toThrow(ForbiddenException);
    });

    it('AC-008: rate limit (429) throws HttpException carrying retryAfterSeconds', async () => {
      const verified = makeConnection({ status: 'VERIFIED' });
      prisma.binanceConnection.findFirst.mockResolvedValueOnce(verified).mockResolvedValueOnce(verified);
      adapter.getCrossMarginAccount.mockResolvedValueOnce({ ok: false, kind: 'HTTP_ERROR', httpStatus: 429, message: 'rate limited', retryAfterSeconds: 42 });

      await expect(service.getAccountSnapshot('user-a', 'conn-1')).rejects.toMatchObject({
        status: 429,
        response: expect.objectContaining({ retryAfterSeconds: 42 }),
      });
    });

    it('AC-008: timeout/network throws a 503 HttpException, not a crash', async () => {
      const verified = makeConnection({ status: 'VERIFIED' });
      prisma.binanceConnection.findFirst.mockResolvedValueOnce(verified).mockResolvedValueOnce(verified);
      adapter.getCrossMarginAccount.mockResolvedValueOnce({ ok: false, kind: 'NETWORK_OR_TIMEOUT', message: 'timeout' });

      await expect(service.getAccountSnapshot('user-a', 'conn-1')).rejects.toThrow(HttpException);
    });

    it('an auth-class error flips the connection to INVALID and rejects with UnauthorizedException', async () => {
      const verified = makeConnection({ status: 'VERIFIED' });
      prisma.binanceConnection.findFirst.mockResolvedValueOnce(verified).mockResolvedValueOnce(verified);
      adapter.getCrossMarginAccount.mockResolvedValueOnce({ ok: false, kind: 'HTTP_ERROR', httpStatus: 401, binanceCode: -2015, message: 'invalid key' });

      await expect(service.getAccountSnapshot('user-a', 'conn-1')).rejects.toThrow(UnauthorizedException);
      expect(prisma.binanceConnection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'INVALID' }) }),
      );
    });

    it('aborts with NotFoundException if the connection was revoked between the ownership check and the fresh secret read', async () => {
      const verified = makeConnection({ status: 'VERIFIED' });
      prisma.binanceConnection.findFirst.mockResolvedValueOnce(verified).mockResolvedValueOnce(null);

      await expect(service.getAccountSnapshot('user-a', 'conn-1')).rejects.toThrow(NotFoundException);
      expect(adapter.getCrossMarginAccount).not.toHaveBeenCalled();
    });

    it('maps a decrypt failure to a 503 HttpException instead of throwing unhandled', async () => {
      const verified = makeConnection({ status: 'VERIFIED' });
      prisma.binanceConnection.findFirst.mockResolvedValueOnce(verified).mockResolvedValueOnce(verified);
      secretVault.decrypt.mockImplementationOnce(() => {
        throw new Error('Unsupported state or unable to authenticate data');
      });

      await expect(service.getAccountSnapshot('user-a', 'conn-1')).rejects.toThrow(HttpException);
      expect(adapter.getCrossMarginAccount).not.toHaveBeenCalled();
    });
  });

  describe('list (U-D01)', () => {
    it('only queries non-deleted connections for the given user', async () => {
      prisma.binanceConnection.findMany.mockResolvedValueOnce([]);
      await service.list('user-a');
      expect(prisma.binanceConnection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-a', deletedAt: null } }),
      );
    });
  });
});
