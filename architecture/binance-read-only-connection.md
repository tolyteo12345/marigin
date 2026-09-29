# Architecture: binance-read-only-connection

Owner: architect-agent | Requirement revision: r1-2026-09-29 (sha256:169ac1c4dd000a187ecfcd150e43f8d0a74b752c485782e51b87418d25f213dc)
BA revision: sha256:961ccc45e0427776c8ffec1d3b474f9aee0000b9f618656d7d546ee5548b3ba7
Decision: features/binance-read-only-connection/decision.json

## Gate check và scope
BA status: APPROVED_WITH_CONDITIONS (COND-001, COND-002, COND-003, due tại gate này — xem cách từng điều kiện được giải quyết dưới). OQ-R01/OQ-R02/OQ-R05 đã RESOLVED bằng evidence. OQ-R03 (nhiều connection trùng account) và OQ-R04 (background re-verify định kỳ) **chưa chốt** — kiến trúc thiết kế theo giả định an toàn nhất (không trùng, không background job) và để ngỏ điểm mở rộng, không tự chọn policy thay user.

**Gap phát hiện trong lúc thiết kế, không có trong BA/requirement**: requirement giả định "user đã đăng nhập" nhưng repository hiện chưa có bất kỳ feature auth/session nào (đây là feature đầu tiên được implement). Kiến trúc này thiết kế theo hợp đồng "cần một session xác thực người dùng hợp lệ, per-request userId đáng tin cậy" nhưng **không tự thiết kế toàn bộ hệ thống đăng nhập** (ngoài scope requirement). Ghi thành **BLOCKER-ARCH-001** ở mục cuối — chặn IMPLEMENTATION, không chặn ARCHITECTURE READY vì thiết kế contract không phụ thuộc cơ chế auth cụ thể.

## Components và dependency contracts
Stack bắt buộc theo quyết định user: **Backend NestJS (TypeScript)**, **Frontend ReactJS**.

**ORM/DB: PostgreSQL + Prisma ORM.** Lý do:
- Prisma map `Decimal` (Postgres `NUMERIC`) sang `Decimal.js` ở tầng ứng dụng — khớp yêu cầu AGENTS.md "Decimal/fixed-point... không float cho money/quantity/rates". Dù feature này chỉ pass-through dữ liệu Binance (string), các field numeric lưu lại cho audit/hiển thị (marginLevel, totalAssetOfBtc...) vẫn nên là `Decimal`/`String` chứ không phải `Float`/`Double` để tránh sai số và để feature sau (Ledger, Risk Engine) tái sử dụng đúng kiểu.
- Postgres hỗ trợ transaction ACID cần cho việc "revoke connection" (xóa secret) và audit log phải atomic.
- NestJS có `@nestjs/prisma` pattern phổ biến, type-safety end-to-end giữa schema và service layer, migration tooling (`prisma migrate`) phù hợp với yêu cầu "append-only, sửa bằng correction có audit" cho các entity audit sau này.
- TypeORM là lựa chọn thay thế khả dĩ nhưng Prisma được chọn vì Decimal type an toàn hơn theo mặc định (TypeORM cần khai báo `type: 'numeric', transformer` thủ công, dễ quên và vô tình rơi về `number`).

Modules (NestJS):
| Module | Trách nhiệm | Phụ thuộc |
|---|---|---|
| `AuthContextModule` (KHÔNG implement, chỉ contract) | Cung cấp `req.user.id` đã xác thực cho mọi request | External — xem BLOCKER-ARCH-001 |
| `BinanceConnectionModule` | CRUD connection (ownership-scoped), điều phối verify | AuthContextModule, SecretVaultModule, BinanceReadOnlyAdapterModule, PrismaModule |
| `SecretVaultModule` | Mã hoá/giải mã api key+secret (envelope encryption) | Secret manager / OS keystore của môi trường deploy |
| `BinanceReadOnlyAdapterModule` | Gọi Binance, CHỈ 2 endpoint GET/USER_DATA đã verify: `/sapi/v1/margin/account`, `/sapi/v1/account/apiRestrictions`. Ký HMAC-SHA256, timestamp/recvWindow, rate-limit backoff, phân loại lỗi | Không phụ thuộc module khác — đây là boundary an toàn duy nhất chạm Binance |
| `AuditModule` | Ghi audit log redacted cho add/verify/read/revoke connection | PrismaModule |
| Frontend `ConnectionFeature` (React) | Form thêm key, hiển thị trạng thái verify, snapshot balance/liability, nút revoke | Gọi REST API qua `fetch`/`axios` với CSRF token, KHÔNG bao giờ giữ secret sau khi submit |

Ranh giới an toàn bắt buộc: `BinanceReadOnlyAdapterModule` là **allowlist cứng 2 endpoint**, implement bằng cách chỉ export 2 method (`getCrossMarginAccount`, `getApiKeyRestrictions`), không expose HTTP client dùng chung cho method khác — ngăn code sau này vô tình gọi endpoint mutation (khớp docs/BINANCE_INTEGRATION.md "Tách read/query, prepare/preview và confirmed execution").

## Domain / storage / ledger
Đây KHÔNG phải ledger tài chính (feature không ghi nhận borrow/sell/buy). Entity chỉ là reference data + audit.

```prisma
model BinanceConnection {
  id                  String    @id @default(uuid())
  userId              String    // từ AuthContext, không nhận từ client body
  label               String
  encryptedApiKey     Bytes     // AES-256-GCM ciphertext
  encryptedApiSecret  Bytes
  encryptionIv        Bytes
  encryptionKeyVersion Int      // hỗ trợ key rotation không cần giải mã lại toàn bộ ngay
  status              ConnectionStatus @default(PENDING_VERIFY)
  accountType         String?   // "MARGIN_1" | "MARGIN_2" | null nếu chưa verify
  permissionSnapshot  Json?     // { enableReading, enableMargin, enableSpotAndMarginTrading, enableWithdrawals, enableFutures, enableVanillaOptions, enablePortfolioMarginTrading, checkedAt } | null nếu không xác định được (COND-003)
  permissionUnknown   Boolean  @default(false) // true khi apiRestrictions call thất bại — fail-closed flag
  lastError           String?
  lastVerifiedAt      DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  deletedAt           DateTime? // set trong transaction cùng lúc null hoá secret khi revoke

  @@index([userId])
}

enum ConnectionStatus {
  PENDING_VERIFY
  VERIFIED
  INVALID
  UNSUPPORTED_ACCOUNT_MODE   // accountType = MARGIN_2, hoặc tài khoản chưa mở Cross Margin (COND-002: 2 lastError message khác nhau, cùng status)
  VERIFY_UNKNOWN             // timeout/network khi verify — KHÔNG map thành INVALID
  REVOKED
}

model ConnectionAuditLog {
  id                String   @id @default(uuid())
  userId            String
  connectionId      String   // vẫn giữ sau khi connection bị revoke để trace lịch sử
  action            String   // CONNECTION_ADDED | VERIFY_ATTEMPTED | VERIFY_SUCCEEDED | VERIFY_FAILED | ACCOUNT_SNAPSHOT_READ | PERMISSION_CHECK_FAILED | CONNECTION_REVOKED
  result            String   // SUCCESS | INVALID | UNSUPPORTED_ACCOUNT_MODE | UNKNOWN_TIMEOUT | ERROR
  requestCorrelationId String
  createdAt         DateTime @default(now())
  detailsRedacted   Json?    // KHÔNG BAO GIỜ chứa apiKey/apiSecret plaintext hoặc ciphertext

  @@index([userId])
  @@index([connectionId])
}
```

Append-only: `ConnectionAuditLog` không update/delete. `BinanceConnection` là mutable state (status thay đổi theo lần verify) nhưng lịch sử thay đổi được tái tạo qua `ConnectionAuditLog`, khớp docs/CAPITAL_PROVENANCE.md "Append-only financial events; sửa bằng correction/reversal có audit" áp dụng tinh thần dù đây không phải financial event.

**COND-001 giải quyết**: chưa gọi được API thật (không có Margin testnet — EV-004), nên schema trên dùng đúng field name/type theo tài liệu chính thức (EV-001, EV-003) làm fixture chuẩn cho implementation và test, KHÔNG bịa thêm field. `implementation.md` (backend-agent) phải trích fixture JSON mẫu dựng lại đúng field list này làm mock response, đồng thời **bắt buộc có một bước manual smoke test bằng tài khoản margin thật (chỉ GET) trước khi coi feature là DONE** (RISK-001 mitigation) để phát hiện sai lệch field thực tế so với tài liệu trước khi release — ghi evidence này vào `qa/binance-read-only-connection.md`, không phải automated test.

## API contracts và state machines
Backend REST (NestJS Controller), tất cả yêu cầu session hợp lệ + CSRF token cho method thay đổi state:

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/api/binance-connections` | session+CSRF | Body `{label, apiKey, apiSecret}`. Tạo record `PENDING_VERIFY`, mã hoá secret, trigger verify đồng bộ trong cùng request (MVP không có background job — khớp requirement "on-demand"), trả về summary KHÔNG chứa secret |
| GET | `/api/binance-connections` | session | List connection của `req.user.id`, chỉ metadata |
| GET | `/api/binance-connections/:id` | session + ownership check | 404 nếu không thuộc user (không phân biệt "không tồn tại" vs "không thuộc bạn" — chống IDOR enumeration, khớp AC-006) |
| POST | `/api/binance-connections/:id/verify` | session+CSRF + ownership | Re-trigger verify on-demand |
| GET | `/api/binance-connections/:id/account-snapshot` | session + ownership | Gọi `getCrossMarginAccount` tươi mỗi lần, trả kèm `fetchedAt` (ISO-8601 UTC), KHÔNG cache |
| DELETE | `/api/binance-connections/:id` | session+CSRF + ownership | Transaction: set `status=REVOKED`, `deletedAt=now()`, null hoá `encryptedApiKey/encryptedApiSecret/encryptionIv`; ghi audit `CONNECTION_REVOKED` |

State machine `ConnectionStatus`:
```
PENDING_VERIFY --(verify: accountType=MARGIN_1)--> VERIFIED
PENDING_VERIFY --(verify: auth/signature error)--> INVALID
PENDING_VERIFY --(verify: accountType=MARGIN_2 HOẶC lỗi "chưa mở Cross Margin")--> UNSUPPORTED_ACCOUNT_MODE   [COND-002: lastError phân biệt 2 message]
PENDING_VERIFY --(verify: timeout/network)--> VERIFY_UNKNOWN
VERIFY_UNKNOWN --(user re-verify)--> {VERIFIED | INVALID | UNSUPPORTED_ACCOUNT_MODE | VERIFY_UNKNOWN}
VERIFIED --(user re-verify, hoặc account-snapshot phát hiện lỗi mới)--> {VERIFIED | INVALID | VERIFY_UNKNOWN}
{bất kỳ trạng thái nào} --(user revoke)--> REVOKED  [terminal, secret đã bị null hoá]
```
`VERIFY_UNKNOWN` không tự động retry — UI hiển thị "không xác nhận được, thử lại" (khớp AGENTS.md "Timeout không đồng nghĩa thất bại").

`permissionUnknown=true` (COND-003 fail-closed) là một cờ độc lập, không phải state riêng của `ConnectionStatus`: một connection có thể `VERIFIED=true` (account đúng Cross Margin Classic) NHƯNG `permissionUnknown=true` nếu call `apiRestrictions` lỗi — UI hiển thị banner "không xác định được quyền của API key này, tự kiểm tra trên Binance" thay vì ngầm coi an toàn.

## Financial formulas
Không áp dụng — feature không tính toán tài chính, chỉ pass-through field Binance (string) nguyên trạng ra frontend. Không parse `marginLevel`, `totalAssetOfBtc`... thành `number`/`float` ở bất kỳ tầng nào; giữ dạng string end-to-end từ Binance → DB (nếu lưu) → API response → React hiển thị. Nếu cần lưu để audit, cột `Json` giữ nguyên string gốc, không ép kiểu số.

## Concurrency / idempotency
- Mọi Binance call trong feature là GET, không mutate — không cần idempotency key phía Binance.
- Race "revoke trong lúc đang verify/đọc dở dang": `DELETE` thực hiện trong 1 DB transaction set `deletedAt` + null hoá secret ngay lập tức. `BinanceReadOnlyAdapterModule` luôn đọc secret từ DB ngay trước khi gọi Binance (không cache secret trong memory/process), nên nếu transaction revoke đã commit trước khi adapter đọc, thao tác đang chạy nhận secret null → abort với lỗi rõ ràng "connection đã bị xoá", không có state lỡ dở dùng key cũ.
- Verify đồng thời nhiều lần trên cùng 1 connection (double-click): dùng Postgres advisory lock theo `connectionId` (per-connection lock, KHÔNG global lock — khớp AGENTS.md "concurrency per-connection không lock toàn cục") bao quanh block verify; request thứ 2 trong lúc đang verify trả về trạng thái hiện tại (`PENDING_VERIFY`, "đang xác minh") thay vì gọi Binance trùng lặp.
- Rate limit (EV-006): `BinanceReadOnlyAdapterModule` theo dõi header `X-MBX-USED-WEIGHT-*` trả về, áp dụng backoff cục bộ (NestJS interceptor + đơn giản token counter per API key, chưa cần Redis ở MVP vì single connection = 1 user 1 key, tải thấp; nếu multi-instance deploy sau này cần Redis — ghi rõ đây là **chủ ý đơn giản hoá cho MVP, trần là single-instance backend**, nâng cấp lên Redis-backed limiter khi scale ngang). Nhận HTTP 429 → đọc `Retry-After`, trả lỗi rõ cho user "Binance đang giới hạn tần suất, thử lại sau Ns", không tự động retry ngầm.

## User confirmation / modes / security / audit
- Toàn bộ platform ở feature này chạy READ_ONLY mặc định (không có PAPER_TRADING/LIVE trong scope) — không có bước "confirm" giao dịch vì không có giao dịch.
- Session: cookie session (NestJS `express-session` hoặc tương đương đã duyệt trong stack chuẩn của project khi implement) + CSRF token (NestJS `csurf`-tương đương) bắt buộc cho POST/DELETE. Ownership: mọi query `BinanceConnection`/`ConnectionAuditLog` filter theo `userId = req.user.id` ở tầng service (không tin path param), test AC-006 phải cố tình truyền id của user khác.
- Secret storage: envelope encryption AES-256-GCM. Data key lấy từ secret manager/KMS hoặc OS-backed keystore của môi trường deploy (theo docs/BINANCE_INTEGRATION.md — cụ thể là AWS KMS/GCP KMS/HashiCorp Vault hay tương đương do DevOps/deploy environment quyết định, KHÔNG hardcode master key trong code hoặc `.env` commit). Response API không bao giờ trả lại `apiKey`/`apiSecret` sau lần tạo, kể cả partial/masked — chỉ trả `label`, `status`, `accountType`, `permissionSnapshot`, `lastVerifiedAt`.
- Logging: interceptor redact toàn bộ field `apiKey`, `apiSecret`, `encryptedApiKey`, `encryptedApiSecret`, `encryptionIv`, header `X-MBX-APIKEY` trước khi ghi log ở mọi log level, kể cả log lỗi (stack trace không được chứa request body chứa secret — dùng DTO tách riêng, không log toàn bộ `req.body`).
- Audit: mỗi request tới `BinanceConnectionModule` ghi `ConnectionAuditLog` với `requestCorrelationId` (UUID per-request, truyền qua NestJS request-scoped provider hoặc middleware), đúng theo docs/RISK_RULES.md "Mỗi attempt ghi intent ID, actor, timestamp... redact credentials" áp dụng tinh thần dù đây không phải financial intent.

## UI handoff
React components:
- `AddConnectionForm`: input label/apiKey/apiSecret, cảnh báo tĩnh "chỉ dùng API key chỉ có quyền đọc (Enable Reading), không bật Enable Spot & Margin Trading hoặc Enable Withdrawals nếu không cần". Sau submit, form tự clear input secret khỏi state/DOM ngay (không giữ trong React state lâu hơn thời gian request).
- `ConnectionStatusCard`: hiển thị `status` (badge màu theo enum), `lastVerifiedAt`, banner cảnh báo riêng nếu `permissionUnknown=true` hoặc `permissionSnapshot` cho thấy quyền vượt mức cần thiết (`enableWithdrawals=true` hoặc `enableSpotAndMarginTrading=true` hoặc `enableFutures=true`).
- `AccountSnapshotPanel`: gọi `GET .../account-snapshot` khi user mở tab/nhấn refresh (không auto-poll), hiển thị `userAssets` (asset/borrowed/free/interest/netAsset dạng string nguyên văn) kèm dòng "Dữ liệu tại HH:MM:SS UTC — {fetchedAt}".
- `RevokeConnectionButton`: confirm dialog (không phải financial confirm, chỉ UX confirm xoá) trước khi gọi DELETE.
- Lỗi (`VERIFY_UNKNOWN`, rate-limited, network) hiển thị message riêng biệt, có nút "Thử lại" thủ công, không tự động retry.

## Validation và rollout
| AC | Component | Test plan |
|---|---|---|
| AC-001 | ConnectionService.verify + Adapter.getCrossMarginAccount | Mock fixture accountType=MARGIN_1 → status VERIFIED |
| AC-002 | Adapter error mapping | Mock lỗi chữ ký/auth (theo EV-005 dạng lỗi timestamp/signature) → status INVALID, không lộ secret trong response/log |
| AC-003 + AC-003b (COND-002) | Adapter + state machine | Mock accountType=MARGIN_2 → UNSUPPORTED_ACCOUNT_MODE (msg "Pro không hỗ trợ"); mock lỗi "chưa mở Cross Margin" → UNSUPPORTED_ACCOUNT_MODE (msg khác) |
| AC-004 (COND-003) | Adapter.getApiKeyRestrictions + fallback | Mock permission rộng (enableWithdrawals=true) → banner cảnh báo; mock call thất bại → permissionUnknown=true, banner "không xác định" |
| AC-005 | AccountSnapshotPanel + endpoint | Mock response đầy đủ field → hiển thị đúng + fetchedAt |
| AC-006 | Ownership guard | Test truy cập connection id của user khác → 404 |
| AC-007 | Revoke transaction | Test sau DELETE, secret bị null trong DB, gọi lại adapter phải fail |
| AC-008 | Adapter timeout/rate-limit handling | Simulate timeout → VERIFY_UNKNOWN (không phải INVALID); simulate 429 → thông báo Retry-After |

Tất cả automated test dùng mocked HTTP (không có Margin testnet — EV-004, RISK-001). Trước khi coi DONE: 1 lần manual smoke test GET-only với tài khoản margin thật của dev/QA, evidence ghi ở `qa/binance-read-only-connection.md`. Không có LIVE activation trong feature này (không có khái niệm LIVE cho read-only). Rollback: revoke connection là đủ để ngừng dùng key, không cần rollback schema đặc biệt ngoài migration chuẩn Prisma.

## Open decisions và readiness
- **BLOCKER-ARCH-001** (chặn IMPLEMENTATION, không chặn ARCHITECTURE READY) | Owner: coordinator + product + user | Feature giả định có session xác thực người dùng (`req.user.id` đáng tin cậy) nhưng chưa có feature auth nào tồn tại trong repo. Trước khi backend-agent bắt đầu, coordinator phải quyết định: (a) đây là feature con của scope hiện tại (mở rộng nhẹ) hay (b) cần một feature `user-authentication` riêng đi qua đầy đủ workflow trước. Kiến trúc này CHỦ Ý không tự chọn để tránh mở rộng scope ngoài yêu cầu ban đầu.
- COND-001: RESOLVED — schema/field dùng đúng tài liệu chính thức (EV-001/EV-003); còn lại "xác nhận cuối bằng manual smoke test" chuyển thành yêu cầu bắt buộc ở QA gate (không chặn architecture).
- COND-002: RESOLVED — state machine + 2 lastError message riêng biệt đã thiết kế ở trên.
- COND-003: RESOLVED — `permissionUnknown` flag fail-closed đã thiết kế ở trên.
- OQ-R03 (duplicate connection cùng account), OQ-R04 (background re-verify): vẫn OPEN, không ảnh hưởng thiết kế MVP hiện tại (thiết kế không giả định unique constraint theo Binance account thật vì không verify được điều đó từ phía app trước khi có key; không có scheduler trong scope). Khi user/product chốt, có thể cần thêm unique constraint hoặc scheduler module — không phải rewrite kiến trúc hiện tại.
- RISK-001 kế thừa từ BA: mitigation (manual smoke test) đã gắn vào Validation và rollout — chưa cần `accepted_by` vì có mitigation cụ thể, không phải waive.

**Đề xuất architecture_status: READY.** Không còn blocker ảnh hưởng THIẾT KẾ (BLOCKER-ARCH-001 ảnh hưởng IMPLEMENTATION, đã ghi rõ owner và điều kiện gỡ). Coordinator quyết định có tiếp tục dispatch backend/frontend-agent hay dừng lại để user xác nhận hướng xử lý BLOCKER-ARCH-001 trước.
