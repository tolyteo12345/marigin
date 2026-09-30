# Implementation: binance-read-only-connection

Owner: coordinator (tổng hợp từ backend-agent + frontend-agent) | Architecture revision: sha256:49b994bf10431bd82b1ce4f4d4f68a80b5ed60baeff29ed754814a3e63e01210
Design revision: sha256:295199cf09e008a4a4ea057f4e039eb81431207b0abaef059988d7c41fdfa90c
Requirement revision: sha256:169ac1c4dd000a187ecfcd150e43f8d0a74b752c485782e51b87418d25f213dc
Decision: features/binance-read-only-connection/decision.json

## Trạng thái tổng quan
Implementation **READY**. Backend + frontend viết đầy đủ theo scope, build sạch, unit test (24 test mới) + e2e test (8 test mới, Postgres thật) pass, verify thật qua Postman/newman + curl trực tiếp với Binance thật (garbage key, GET-only, không rủi ro tài chính). Chưa chạy manual smoke test với tài khoản margin thật hợp lệ (RISK-001 mitigation, thuộc QA gate).

## Deviation so với architecture (đã ghi lại, không tự ý âm thầm lệch)
**Sửa lỗ hổng crypto trong schema**: architecture doc's Prisma sketch dùng 1 cột `encryptionIv` dùng chung cho cả `encryptedApiKey` và `encryptedApiSecret`. Tái dùng 1 IV cho 2 plaintext khác nhau mã hoá cùng 1 key là lỗi nonce-reuse của AES-256-GCM (phá vỡ confidentiality/integrity). Thêm cột `encryptionIvApiSecret` (migration `20260930024802_binance_connection_fix_iv`), IV riêng cho từng secret. Đây là fix crypto-correctness phát hiện lúc implement, không phải thay đổi business rule/AC — ghi rõ ở `docs/DATABASE.md`, không bump revision architecture.md. Có test regression (`secret-vault.service.spec.ts`: "generates a fresh random IV on every call").

## Cập nhật: bọc decrypt() để tránh 500 chưa xử lý khi key rotation có vấn đề
Tự review lại phát hiện `verify()`/`getAccountSnapshot()` gọi `secretVault.decrypt()` không có try/catch — nếu `BINANCE_SECRET_ENCRYPTION_KEY` bị đổi không qua migration đúng cách (hoặc ciphertext hỏng), decrypt throw sẽ văng thành 500 chưa xử lý (vi phạm AGENTS.md "không throw exception làm crash"), và về mặt ý nghĩa đây là lỗi vận hành chứ không phải "key Binance sai" nên không nên map thành INVALID. Đã bọc try/catch ở cả 2 chỗ: `verify()` → `VERIFY_UNKNOWN` (không gọi Binance), `getAccountSnapshot()` → HTTP 503 (không gọi Binance). Thêm `Logger.error` để không nuốt lỗi âm thầm. Test mới: `binance-connection.service.spec.ts` — "maps a decrypt failure to VERIFY_UNKNOWN instead of throwing" + "maps a decrypt failure to a 503 HttpException instead of throwing unhandled". Verify lại: 69/69 unit, 16/16 e2e pass.

## Backend (`backend/`, thêm vào NestJS app hiện có của user-authentication)
Module mới theo đúng tên trong architecture: `SecretVaultModule`, `BinanceReadOnlyAdapterModule`, `ConnectionAuditModule` (đổi tên từ "AuditModule" trong architecture để không đụng `AuditModule` sẵn có của user-authentication — cùng khái niệm, khác bảng: `ConnectionAuditLog` so với `AuthAuditLog`), `BinanceConnectionModule` (service + controller + DTO). Đăng ký vào `app.module.ts`.

- **`SecretVaultService`** (`src/secret-vault/`): AES-256-GCM, master key từ env `BINANCE_SECRET_ENCRYPTION_KEY` (base64 32 byte) — MVP deliberate simplification giống `SESSION_SECRET`, không phải AWS/GCP KMS thật (architecture để ngỏ, do deploy environment quyết định). `encryptionKeyVersion` lưu sẵn cho rotation tương lai, hiện chỉ version=1. Ciphertext = encrypted bytes + GCM auth tag (16 byte) nối liền, không cột riêng cho tag.
- **`BinanceReadOnlyAdapterService`** (`src/binance-adapter/`): allowlist cứng đúng 2 method `getCrossMarginAccount`/`getApiKeyRestrictions`, HMAC-SHA256 signing (timestamp+recvWindow=5000ms), timeout 10s qua `AbortController`. Trả `BinanceAdapterResult<T>` discriminated union (`ok:true` | `HTTP_ERROR` kèm `binanceCode`/`retryAfterSeconds` | `NETWORK_OR_TIMEOUT`) — không tự map thành business status, để `BinanceConnectionService` quyết định (giữ adapter là boundary thuần, đúng "Ranh giới an toàn bắt buộc").
- **`binance-error-mapping.ts`**: danh sách Binance error code coi là "auth/credentials sai" → `INVALID`. Ban đầu theo docs (-1021,-1022,-2014,-2015, NEEDS_VERIFICATION vì không có sandbox — RISK-001). **Đã verify thật** bằng 1 lần gọi trực tiếp `GET /sapi/v1/margin/account` với garbage API key tới `api.binance.com` (GET-only, không rủi ro tài chính): Binance trả `{"code":-2008,"msg":"Invalid Api-Key ID."}` — code này KHÔNG có trong danh sách ban đầu, ban đầu bị phân loại nhầm thành `UNSUPPORTED_ACCOUNT_MODE`. Đã sửa thêm `-2008` vào danh sách auth-error, verify lại cho ra đúng `INVALID`. Đây là 1 điểm dữ liệu thật (không phải chỉ đọc docs) cho RISK-001, các code còn lại (-1021,-1022,-2014,-2015) vẫn NEEDS_VERIFICATION.
- **`ConnectionAuditService`** (`src/connection-audit/`): ghi `ConnectionAuditLog`, cùng pattern `AuditService` của user-authentication nhưng bảng riêng.
- **`BinanceConnectionService`** (`src/binance-connection/`):
  - `create`: encrypt cả 2 secret (IV riêng biệt), tạo record `PENDING_VERIFY`, verify đồng bộ ngay trong cùng call.
  - `verify`: wrap trong `prisma.$transaction` (timeout 25s cho 2 lệnh gọi Binance tuần tự) + `pg_try_advisory_xact_lock(hashtextextended(connectionId, 0))` — xact-scoped (không phải session-scoped) để tránh vấn đề connection-pool của Postgres advisory lock khi dùng qua Prisma pool; double-verify đồng thời trả về state hiện tại thay vì gọi Binance lần 2. Classify: `MARGIN_1`→VERIFIED, `MARGIN_2`→UNSUPPORTED_ACCOUNT_MODE ("Pro"), lỗi auth-code→INVALID, lỗi khác→UNSUPPORTED_ACCOUNT_MODE ("chưa mở", best-effort per COND-002 — xem Deviation trên), timeout/network→VERIFY_UNKNOWN (không bao giờ map thành INVALID). Khi VERIFIED, gọi thêm `getApiKeyRestrictions`: thành công lưu `permissionSnapshot`, thất bại → `permissionUnknown=true` fail-closed (COND-003), không ghi đè snapshot cũ nếu có.
  - `revoke`: null hoá cả 4 field bí mật (2 ciphertext + 2 IV) trong cùng update với `status=REVOKED`, `deletedAt`.
  - `getAccountSnapshot`: đọc lại secret **tươi ngay trước khi gọi Binance** (không dùng object đã load trước đó) để bắt đúng race "revoke giữa lúc đang đọc" (architecture doc Concurrency) — 404 nếu đã revoke. Lỗi auth-code → flip status sang INVALID + 401; 429/418 → HttpException kèm `retryAfterSeconds`; timeout/network → 503; lỗi khác → 502.
  - `list`: filter `deletedAt: null` (U-D01 resolved: REVOKED không hiện trong list).
  - Ownership: mọi thao tác qua `findOwnedOrThrow` (`userId` + `deletedAt: null`), 404 đồng nhất không phân biệt "không tồn tại" vs "không thuộc bạn" (AC-006).

**Env mới**: `BINANCE_SECRET_ENCRYPTION_KEY` thêm vào `.env`/`.env.example` với hướng dẫn generate.

**Bằng chứng kiểm thử (đã tự chạy lại, không chỉ tin báo cáo)**:
```
cd backend && npx tsc -b --noEmit && npx nest build   # sạch
cd backend && npm test
Test Suites: 8 passed, 8 total
Tests:       69 passed, 69 total     # 32 cũ (user-authentication) + 1 account-link (đã có trước) + 36 mới (binance: 7 secret-vault, 5 adapter, 19 service, chênh do rebalance describe)
cd backend && DATABASE_URL='postgresql://user:password@localhost:5432/margin_trading_test?schema=public' BINANCE_SECRET_ENCRYPTION_KEY='<key>' npm run test:e2e
Test Suites: 2 passed, 2 total
Tests:       16 passed, 16 total     # 8 auth (đã có) + 8 binance mới
```
`test:e2e` script đổi thành luôn chạy `--runInBand`: 2 file e2e dùng chung 1 Postgres test DB và mỗi file tự dọn bảng ở `beforeEach` — chạy song song (Jest default nhiều worker) gây race thật giữa 2 file (đã tự quan sát: 500 lỗi giả + `ECONNREFUSED` ngẫu nhiên khi không có `--runInBand`, biến mất hoàn toàn sau khi thêm). Ghi lại trong `backend/README.md`.

**Verify thật với Binance (không chỉ mock)**: chạy Postman collection mới `backend/postman/margin-trading-binance-connections.postman_collection.json` bằng `newman` nhắm vào backend dist đang chạy thật (không mock adapter) — toàn bộ 13 request/0 fail. Add connection với garbage API key gọi THẬT tới `api.binance.com` (GET-only), nhận đúng lỗi `-2008` (xem mục Deviation/error-mapping trên), verify lại `POST .../verify`, `GET .../account-snapshot` (403 đúng vì status không phải VERIFIED), revoke — dọn sạch dữ liệu test sau khi xong.

## Frontend (`frontend/`, React + Vite, thêm vào app hiện có)
5 component theo đúng `design/binance-read-only-connection.md`: `BinanceConnectionsPage`, `AddConnectionForm`, `ConnectionStatusCard`, `AccountSnapshotPanel`, `RevokeConnectionButton` (`src/components/binance/`). Tái dùng đúng 3 common component có sẵn (`TextField`, `Button`, `InlineAlert`/`InlineStatus`), không thêm pattern mới — khớp mục "Common component mapping" của design. Gắn vào `App.tsx` ngay dưới `AccountLinkPanel` trong shell đã đăng nhập.

API client mới `src/api/binanceConnectionClient.ts` (GET/POST/DELETE tới `/api/binance-connections`, tái dùng `getCsrfToken`/`ApiError` từ `authClient.ts` — CSRF token dùng chung session, không tách riêng theo feature) + `src/api/binanceConnectionTypes.ts`.

**Bằng chứng (đã tự chạy lại)**:
```
cd frontend && npx tsc -b        # sạch
cd frontend && npm run build     # sạch
cd frontend && npm test -- --run
Test Files  5 passed (5)
Tests       18 passed (18)        # +6 test mới: BinanceConnectionsPage.test.tsx (empty state, list VERIFIED,
                                   # add->INVALID hiển thị đúng ở card không phải form, permission-too-broad
                                   # banner + acknowledge, revoke xoá card, cancel confirm giữ nguyên card)
cd frontend && npm run lint
2 warnings react/set-state-in-effect (1 cũ đã biết ở AccountLinkPanel.tsx, 1 mới ở BinanceConnectionsPage.tsx cùng pattern — chấp nhận được, nhất quán với precedent đã duyệt trước đó cho AccountLinkPanel)
```

**Chưa verify được trong browser thật** (không có công cụ trình duyệt trong môi trường này): đã xác nhận dev server Vite phục vụ đúng bundle mới (`curl http://localhost:5173/` 200, `npx tsc -b`/`vite build` sạch), nhưng KHÔNG tự click-through UI thật để xem render/interaction — nói rõ theo AGENTS.md thay vì nhận là đã test UI.

## Việc còn lại trước khi coi DONE
1. **Manual smoke test với tài khoản margin thật** (RISK-001 mitigation, due tại QA gate theo architecture) — GET-only, dùng tài khoản dev/QA thật, xác nhận field response thật khớp EV-001/EV-003 và các Binance error code còn lại (-1021, -1022, -2014, -2015) đúng như đã giả định (chỉ -2008 đã tự verify thật ở trên). Không thể tự thực hiện (không có tài khoản margin thật/API key thật trong môi trường này).
2. **Verify UI thật trong browser** (click-through add/verify/revoke/xem snapshot bằng mắt) — chưa làm được trong môi trường này (không có công cụ trình duyệt), chỉ verify được qua tsc/build/lint/test + API thật qua curl/Postman.
3. Quyết định U-D01 (`GET /api/binance-connections` filter REVOKED) đã CHỐT là filter bỏ (implementation làm theo nhánh này), khớp ý định ban đầu của design.

## Handoff cho CODE_REVIEW
Đề xuất chuyển CODE_REVIEW — backend có test coverage tốt (67 unit + 16 e2e + verify thật qua Postman/Binance thật), frontend cũng đã có unit test hành vi (18 test qua cả 2 feature, 6 test mới cho feature này) tương đương coverage đã áp dụng cho user-authentication. Mục 1-2 còn lại đều cần môi trường/tài khoản thật ngoài phạm vi agent, không phải việc code còn thiếu.
