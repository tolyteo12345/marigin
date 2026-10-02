# Database schema — tài liệu sống

Đây là bản ghi hiện trạng thực tế của toàn bộ schema database dùng chung giữa các feature (không phải kế hoạch/dự định). Mọi thay đổi schema (thêm/sửa/xóa bảng, cột, quan hệ, enum, index, migration) BẮT BUỘC phải cập nhật file này trong cùng thay đổi — architecture hoặc implementation không được coi là READY/hoàn tất nếu tài liệu này chưa khớp thực tế. Xem quy tắc bắt buộc tại `AGENTS.md`.

Quy ước:
- Mỗi bảng có 1 mục, ghi rõ feature nào tạo ra/sở hữu chính (owner feature) và feature nào phụ thuộc/tham chiếu.
- Không xóa lịch sử bảng đã từng tồn tại — nếu bảng bị loại bỏ, chuyển xuống "Đã loại bỏ" kèm lý do và feature/revision liên quan, không xóa khỏi tài liệu.
- Trạng thái: `PLANNED` (đã thiết kế ở architecture, chưa implement), `IMPLEMENTED` (đã có migration chạy thật), `DEPRECATED` (không dùng nữa nhưng dữ liệu/bảng có thể còn tồn tại).
- Kiểu dữ liệu tiền/số lượng/tỷ lệ tài chính phải là `Decimal`/`Numeric`/`String` — không `Float`/`Double` (khớp AGENTS.md).

## Danh sách bảng hiện tại

| Bảng | Trạng thái | Owner feature | Mô tả ngắn | Revision architecture liên quan |
|---|---|---|---|---|
| BinanceConnection | IMPLEMENTED | binance-read-only-connection | Binance API key connection (encrypted) + trạng thái verify per-user | sha256:49b994bf10431bd82b1ce4f4d4f68a80b5ed60baeff29ed754814a3e63e01210 |
| ConnectionAuditLog | IMPLEMENTED | binance-read-only-connection | Audit log redacted cho add/verify/read/revoke connection | sha256:49b994bf10431bd82b1ce4f4d4f68a80b5ed60baeff29ed754814a3e63e01210 |
| User | IMPLEMENTED | user-authentication | Identity gốc; không chứa email/password trực tiếp (xem LocalCredential/TelegramIdentity) | sha256:6a4f01e3fbade29bbe3471d08d9ac48db553056eb58d497d8dc5efed4344b45b |
| LocalCredential | IMPLEMENTED | user-authentication | Email + password hash (argon2id) cho 1 User, tối đa 1/user ở MVP | sha256:6a4f01e3fbade29bbe3471d08d9ac48db553056eb58d497d8dc5efed4344b45b |
| TelegramIdentity | IMPLEMENTED | user-authentication | Telegram identity (telegramUserId) cho 1 User, tối đa 1/user ở MVP, telegramUserId unique toàn hệ thống | sha256:6a4f01e3fbade29bbe3471d08d9ac48db553056eb58d497d8dc5efed4344b45b |
| TelegramLoginRequest | IMPLEMENTED | user-authentication | Phiên đăng nhập/liên kết Telegram đang chờ, khớp bởi bot khi user gửi `/start <code>` (deep-link), ephemeral | sha256:6a4f01e3fbade29bbe3471d08d9ac48db553056eb58d497d8dc5efed4344b45b |
| Session | IMPLEMENTED | user-authentication | Session store cho `express-session` (custom `PrismaSessionStore`), ephemeral, không phải audit trail | sha256:6a4f01e3fbade29bbe3471d08d9ac48db553056eb58d497d8dc5efed4344b45b |
| AuthAuditLog | IMPLEMENTED | user-authentication | Audit log redacted cho register/login/logout/link-account | sha256:6a4f01e3fbade29bbe3471d08d9ac48db553056eb58d497d8dc5efed4344b45b |
| BorrowPosition | IMPLEMENTED | capital-provenance-ledger | Khoản vay nội bộ: asset, quantity, first_borrow_entry_price immutable, liability, reserved proceeds, trạng thái OPEN/REPAID/DRIFT_DETECTED | sha256:da81fdb2a2756da5e4fd9683f793df7aa2c39bd76b8f83917b3a979def7b83a2 |
| AllocationLot | IMPLEMENTED | capital-provenance-ledger | Lot BTC/ETH mua từ 1 nguồn vốn duy nhất (personal hoặc 1 Borrow Position), theo dõi remaining quantity khi bán một phần | sha256:da81fdb2a2756da5e4fd9683f793df7aa2c39bd76b8f83917b3a979def7b83a2 |
| LedgerEvent | IMPLEMENTED | capital-provenance-ledger | Append-only event (borrow/sell/buy/lot-sold/repay/correction/dust-written-off), idempotency key per user | sha256:da81fdb2a2756da5e4fd9683f793df7aa2c39bd76b8f83917b3a979def7b83a2 |
| PersonalCapitalDeclaration | IMPLEMENTED | capital-provenance-ledger | Vốn cá nhân user tự khai báo (USDT), 1 dòng/user — deviation phát hiện khi implementation | sha256:da81fdb2a2756da5e4fd9683f793df7aa2c39bd76b8f83917b3a979def7b83a2 |

Ghi chú: `BinanceConnection.userId` (string) là FK logic tới `User.id` (uuid) của feature `user-authentication` — đã xác nhận khớp kiểu khi `architecture/user-authentication.md` đạt READY (2026-09-29). Không thay đổi nội dung/revision của `architecture/binance-read-only-connection.md` vì contract `req.user.id`/cookie session/CSRF không đổi so với giả định ban đầu (BLOCKER-ARCH-001), chỉ có ghi chú tài liệu này được cập nhật.

## Chi tiết từng bảng

### BinanceConnection
Trạng thái: IMPLEMENTED
Owner feature: binance-read-only-connection (architecture/binance-read-only-connection.md revision: sha256:49b994bf10431bd82b1ce4f4d4f68a80b5ed60baeff29ed754814a3e63e01210)
Phụ thuộc bởi: (chưa có feature nào khác)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid | PK |
| userId | string (uuid) | FK tới User.id (feature user-authentication, architecture/user-authentication.md sha256:6a4f01e3fbade29bbe3471d08d9ac48db553056eb58d497d8dc5efed4344b45b) |
| label | string | |
| encryptedApiKey | bytes | AES-256-GCM ciphertext, không plaintext |
| encryptedApiSecret | bytes | AES-256-GCM ciphertext, không plaintext |
| encryptionIv | bytes | IV cho encryptedApiKey |
| encryptionIvApiSecret | bytes | IV riêng cho encryptedApiSecret — thêm trong implementation (2026-09-30), KHÁC với architecture doc gốc (chỉ có 1 `encryptionIv` dùng chung). Lý do: dùng chung 1 IV cho 2 plaintext khác nhau mã hoá cùng 1 key là lỗi nonce-reuse của AES-GCM (phá vỡ confidentiality/integrity), không phải business rule nên backend-agent tự sửa tại implementation, không cần BA/architect duyệt lại — chỉ ghi nhận deviation ở đây, không bump revision architecture.md vì không đổi AC/behavior. |
| encryptionKeyVersion | int | hỗ trợ key rotation |
| status | enum ConnectionStatus | PENDING_VERIFY \| VERIFIED \| INVALID \| UNSUPPORTED_ACCOUNT_MODE \| VERIFY_UNKNOWN \| REVOKED |
| accountType | string? | "MARGIN_1" \| "MARGIN_2" \| null |
| permissionSnapshot | json? | snapshot enableReading/enableMargin/... từ Binance, null nếu không xác định được |
| permissionUnknown | boolean | fail-closed flag khi không xác định được permission |
| lastError | string? | |
| lastVerifiedAt | datetime? | |
| createdAt / updatedAt | datetime | |
| deletedAt | datetime? | set cùng lúc null hoá secret khi revoke |

Quan hệ: `userId` → User (feature user-authentication, IMPLEMENTED).
Index/constraint quan trọng: index theo `userId`.
Lịch sử thay đổi: 2026-09-29 — thiết kế lần đầu tại architecture/binance-read-only-connection.md. 2026-09-29 — cập nhật ghi chú `userId` thành FK cụ thể tới User.id sau khi architecture/user-authentication.md READY (không đổi kiểu dữ liệu, không đổi revision của architecture này). 2026-09-30 — migration `20260930024304_binance_read_only_connection` áp dụng thật lên Postgres (`prisma migrate dev`), chuyển PLANNED → IMPLEMENTED. 2026-09-30 — migration `20260930024802_binance_connection_fix_iv` thêm cột `encryptionIvApiSecret` (sửa nonce-reuse AES-GCM, xem ghi chú cột phía trên).

### ConnectionAuditLog
Trạng thái: IMPLEMENTED
Owner feature: binance-read-only-connection (architecture/binance-read-only-connection.md revision: sha256:49b994bf10431bd82b1ce4f4d4f68a80b5ed60baeff29ed754814a3e63e01210)
Phụ thuộc bởi: (chưa có feature nào khác)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid | PK |
| userId | string | |
| connectionId | string | giữ lại sau khi connection bị revoke |
| action | string | CONNECTION_ADDED \| VERIFY_ATTEMPTED \| VERIFY_SUCCEEDED \| VERIFY_FAILED \| ACCOUNT_SNAPSHOT_READ \| PERMISSION_CHECK_FAILED \| CONNECTION_REVOKED |
| result | string | SUCCESS \| INVALID \| UNSUPPORTED_ACCOUNT_MODE \| UNKNOWN_TIMEOUT \| ERROR |
| requestCorrelationId | string | |
| createdAt | datetime | |
| detailsRedacted | json? | KHÔNG BAO GIỜ chứa apiKey/apiSecret |

Quan hệ: `connectionId` liên kết logic tới BinanceConnection (không FK cứng để giữ lại sau khi xóa).
Index/constraint quan trọng: index theo `userId`, index theo `connectionId`. Append-only — không update/delete.
Lịch sử thay đổi: 2026-09-29 — thiết kế lần đầu tại architecture/binance-read-only-connection.md. 2026-09-30 — migration `20260930024304_binance_read_only_connection` áp dụng thật lên Postgres, chuyển PLANNED → IMPLEMENTED.

### User
Trạng thái: IMPLEMENTED
Owner feature: user-authentication (architecture/user-authentication.md revision: sha256:6a4f01e3fbade29bbe3471d08d9ac48db553056eb58d497d8dc5efed4344b45b)
Phụ thuộc bởi: binance-read-only-connection (BinanceConnection.userId)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid | PK |
| createdAt / updatedAt | datetime | |

Quan hệ: 1-1 với LocalCredential (optional), 1-1 với TelegramIdentity (optional).
Index/constraint quan trọng: không có unique field ngoài PK ở bảng này (identity thật nằm ở LocalCredential/TelegramIdentity).
Lịch sử thay đổi: 2026-09-29 — thiết kế lần đầu tại architecture/user-authentication.md. 2026-09-29 — migration `20260929000000_init` áp dụng thật lên Postgres (`prisma migrate deploy`), chuyển PLANNED → IMPLEMENTED.

### LocalCredential
Trạng thái: IMPLEMENTED
Owner feature: user-authentication (architecture/user-authentication.md revision: sha256:6a4f01e3fbade29bbe3471d08d9ac48db553056eb58d497d8dc5efed4344b45b)
Phụ thuộc bởi: (chưa có feature nào khác)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid | PK |
| userId | string (uuid) | FK → User.id, unique (tối đa 1 local credential/user ở MVP) |
| email | string | unique, login lookup key |
| passwordHash | string | argon2id encoded string (salt+params nhúng trong chuỗi), không bao giờ plaintext/log |
| emailVerifiedAt | datetime? | null = chưa verify; nullable chủ ý để OQ-A05 (bắt buộc verify email?) quyết sau không cần đổi schema |
| failedLoginCount | int | default 0, tăng atomic mỗi lần login sai |
| lockedUntil | datetime? | null = không khoá; ngưỡng lockout đọc từ config (OQ-A07 chưa chốt giá trị cuối) |
| createdAt / updatedAt | datetime | |

Quan hệ: `userId` → User.id.
Index/constraint quan trọng: unique(`userId`), unique(`email`).
Lịch sử thay đổi: 2026-09-29 — thiết kế lần đầu tại architecture/user-authentication.md. 2026-09-29 — migration `20260929000000_init` áp dụng thật lên Postgres, chuyển PLANNED → IMPLEMENTED.

### TelegramIdentity
Trạng thái: IMPLEMENTED
Owner feature: user-authentication (architecture/user-authentication.md revision: sha256:6a4f01e3fbade29bbe3471d08d9ac48db553056eb58d497d8dc5efed4344b45b)
Phụ thuộc bởi: (chưa có feature nào khác)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid | PK |
| userId | string (uuid) | FK → User.id, unique (tối đa 1 Telegram identity/user ở MVP) |
| telegramUserId | bigint | unique toàn hệ thống — tối đa 1 User sở hữu 1 Telegram account (BR-002/BR-004) |
| telegramUsername | string? | |
| firstName | string? | lấy từ `message.from.first_name` lúc bot xác nhận `/start` |
| lastName | string? | |
| linkedAt | datetime | |
| lastLoginAt | datetime? | |

Quan hệ: `userId` → User.id.
Index/constraint quan trọng: unique(`userId`), unique(`telegramUserId`) — chặn race liên kết trùng ở tầng DB, không chỉ application check.
Lịch sử thay đổi: 2026-09-29 — thiết kế lần đầu tại architecture/user-authentication.md (Telegram Login Widget, có `photoUrl`). 2026-09-29 — đổi cơ chế Telegram sang bot deep-link (`/start <code>`): bỏ cột `photoUrl` (không có sẵn từ update Bot API mà không gọi thêm API), `firstName` đổi thành nullable (cùng lý do), cùng revision architecture mới. 2026-09-29 — migration `20260929000000_init` áp dụng thật lên Postgres, chuyển PLANNED → IMPLEMENTED.

### TelegramLoginRequest
Trạng thái: IMPLEMENTED
Owner feature: user-authentication (architecture/user-authentication.md revision: sha256:6a4f01e3fbade29bbe3471d08d9ac48db553056eb58d497d8dc5efed4344b45b)
Phụ thuộc bởi: (chưa có feature nào khác)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| code | string | PK, base64url(crypto.randomBytes(32)) — dùng luôn làm start-parameter của deep link |
| purpose | string | LOGIN \| LINK |
| linkingUserId | string (uuid)? | set khi purpose=LINK: User.id của session đã đăng nhập lúc tạo request |
| initiatorSessionSid | string | sid của session đã sinh `code`; bắt buộc khớp lúc claim (chống hijack) |
| status | string | PENDING \| CONFIRMED \| CLAIMED \| EXPIRED \| REJECTED |
| telegramUserId | bigint? | điền khi bot nhận `/start` hợp lệ |
| telegramUsername | string? | |
| firstName | string? | |
| lastName | string? | |
| createdAt | datetime | |
| expiresAt | datetime | createdAt + ngưỡng kỹ thuật (mặc định 300s) |
| confirmedAt | datetime? | |
| claimedAt | datetime? | |

Quan hệ: `linkingUserId` → User.id (logic, không FK cứng bắt buộc vì có thể null); không FK tới TelegramIdentity (record này ephemeral, chỉ dùng để bàn giao kết quả xác nhận).
Index/constraint quan trọng: index theo `initiatorSessionSid`. Ephemeral — không phải audit trail; sự kiện quan trọng ghi lại qua AuthAuditLog.
Lịch sử thay đổi: 2026-09-29 — thiết kế lần đầu tại architecture/user-authentication.md (thay thế cơ chế Telegram Login Widget/HMAC bằng bot deep-link). 2026-09-29 — migration `20260929000000_init` áp dụng thật lên Postgres, chuyển PLANNED → IMPLEMENTED.

### Session
Trạng thái: IMPLEMENTED
Owner feature: user-authentication (architecture/user-authentication.md revision: sha256:6a4f01e3fbade29bbe3471d08d9ac48db553056eb58d497d8dc5efed4344b45b)
Phụ thuộc bởi: (chưa có feature nào khác)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| sid | string | PK, session id từ express-session |
| data | string | JSON.stringify(session payload), chứa `userId` khi đã login và `loginAt` (dùng để enforce absolute TTL 30 ngày — BR-011) |
| expiresAt | datetime | rolling 7 ngày, gia hạn mỗi request active (BR-011) |

Quan hệ: không có FK cứng (session data tham chiếu userId trong JSON, không migrate-checked).
Index/constraint quan trọng: index theo `expiresAt` (dọn session hết hạn). Không phải append-only — bị xoá khi logout/hết hạn, không phải audit trail.
Lịch sử thay đổi: 2026-09-29 — thiết kế lần đầu tại architecture/user-authentication.md (custom PrismaSessionStore implement `express-session` Store interface). 2026-09-29 — migration `20260929000000_init` áp dụng thật lên Postgres, chuyển PLANNED → IMPLEMENTED.

### AuthAuditLog
Trạng thái: IMPLEMENTED
Owner feature: user-authentication (architecture/user-authentication.md revision: sha256:6a4f01e3fbade29bbe3471d08d9ac48db553056eb58d497d8dc5efed4344b45b)
Phụ thuộc bởi: (chưa có feature nào khác)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid | PK |
| userId | string (uuid)? | null khi chưa xác định được user (vd. login sai email) |
| action | string | REGISTER_LOCAL \| LOGIN_LOCAL_SUCCESS \| LOGIN_LOCAL_FAILED \| LOGIN_LOCAL_LOCKED \| TELEGRAM_LOGIN_REQUEST_CREATED \| TELEGRAM_LOGIN_CONFIRMED \| TELEGRAM_LOGIN_CLAIMED \| TELEGRAM_LOGIN_EXPIRED \| TELEGRAM_WEBHOOK_REJECTED \| LOGOUT \| ACCOUNT_LINK_TELEGRAM \| ACCOUNT_LINK_LOCAL \| ACCOUNT_LINK_REJECTED \| RATE_LIMITED |
| result | string | SUCCESS \| FAILURE \| REJECTED |
| requestCorrelationId | string | |
| createdAt | datetime | |
| detailsRedacted | json? | KHÔNG BAO GIỜ chứa password/passwordHash/session secret/bot token/session id |

Quan hệ: `userId` liên kết logic tới User (không FK cứng — giữ log kể cả nếu user bị xoá trong tương lai, dù xoá user chưa nằm trong scope MVP).
Index/constraint quan trọng: index theo `userId`. Append-only — không update/delete.
Lịch sử thay đổi: 2026-09-29 — thiết kế lần đầu tại architecture/user-authentication.md. 2026-09-29 — cập nhật danh sách `action` cho cơ chế Telegram bot deep-link (thay LOGIN_TELEGRAM_SUCCESS/FAILED bằng TELEGRAM_LOGIN_REQUEST_CREATED/CONFIRMED/CLAIMED/EXPIRED/TELEGRAM_WEBHOOK_REJECTED), cùng revision architecture mới. 2026-09-29 — migration `20260929000000_init` áp dụng thật lên Postgres, chuyển PLANNED → IMPLEMENTED.

### BorrowPosition
Trạng thái: IMPLEMENTED
Owner feature: capital-provenance-ledger (architecture/capital-provenance-ledger.md revision: sha256:da81fdb2a2756da5e4fd9683f793df7aa2c39bd76b8f83917b3a979def7b83a2)
Phụ thuộc bởi: AllocationLot, LedgerEvent (cùng feature)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid | PK |
| userId | string (uuid) | FK logic → User.id (feature user-authentication) |
| borrowedAsset | string | free-form (vd. "ZEC", "WLD"), không enum vì danh sách mở |
| quantity | Decimal(36,18) | |
| firstBorrowEntryPrice | Decimal(36,18) | immutable — không có endpoint update |
| liabilityLedger | Decimal(36,18) | principal+interest theo ledger nội bộ, đơn vị borrowedAsset |
| liabilityBinanceLast | Decimal(36,18)? | snapshot lần reconcile gần nhất, chỉ hiển thị/so sánh |
| reservedAmountUsdt | Decimal(36,2) | mặc định 0 |
| status | enum BorrowPositionStatus | OPEN \| REPAID \| DRIFT_DETECTED |
| version | int | optimistic lock, mặc định 0 |
| createdAt / updatedAt / repaidAt | datetime | |

Quan hệ: `userId` → User (feature user-authentication). `AllocationLot.fundingBorrowPositionId` → BorrowPosition (optional).
Index/constraint quan trọng: index theo `userId`, `(userId, borrowedAsset)`; **partial unique index** `(userId, borrowedAsset) WHERE status = 'OPEN'` (BR-002, tối đa 1 position OPEN/asset/user) — thêm bằng migration SQL thủ công vì Prisma schema không khai báo được WHERE clause.
Lịch sử thay đổi: 2026-10-01 — thiết kế lần đầu tại architecture/capital-provenance-ledger.md. 2026-10-01 — migration `20261001062909_capital_provenance_ledger` áp dụng thật lên Postgres (`prisma migrate dev`), chuyển PLANNED → IMPLEMENTED.

### AllocationLot
Trạng thái: IMPLEMENTED
Owner feature: capital-provenance-ledger (architecture/capital-provenance-ledger.md revision: sha256:da81fdb2a2756da5e4fd9683f793df7aa2c39bd76b8f83917b3a979def7b83a2)
Phụ thuộc bởi: (chưa có feature nào khác)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid | PK |
| userId | string (uuid) | |
| asset | enum AllocationAsset | BTC \| ETH — enum tự chặn SOL ở tầng DB |
| quantity | Decimal(36,18) | quantity gốc khi mua |
| remainingQuantity | Decimal(36,18) | giảm dần khi LOT_SOLD |
| costBasisUsdt | Decimal(36,2) | |
| fundingSource | enum AllocationFundingSource | PERSONAL \| BORROW |
| fundingBorrowPositionId | string? | bắt buộc non-null khi fundingSource=BORROW (app-level check) |
| version | int | optimistic lock |
| createdAt / updatedAt | datetime | |

Quan hệ: `fundingBorrowPositionId` → BorrowPosition (optional).
Index/constraint quan trọng: index theo `userId`, `fundingBorrowPositionId`.
Lịch sử thay đổi: 2026-10-01 — thiết kế lần đầu tại architecture/capital-provenance-ledger.md. 2026-10-01 — migration `20261001062909_capital_provenance_ledger` áp dụng thật lên Postgres, chuyển PLANNED → IMPLEMENTED.

### LedgerEvent
Trạng thái: IMPLEMENTED
Owner feature: capital-provenance-ledger (architecture/capital-provenance-ledger.md revision: sha256:da81fdb2a2756da5e4fd9683f793df7aa2c39bd76b8f83917b3a979def7b83a2)
Phụ thuộc bởi: (chưa có feature nào khác)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid | PK |
| userId | string (uuid) | |
| type | enum LedgerEventType | BORROW_OPENED \| ASSET_SOLD \| ASSET_BOUGHT \| LOT_SOLD \| REPAY \| CORRECTION \| DUST_WRITTEN_OFF |
| borrowPositionId | string? | |
| allocationLotId | string? | |
| payload | json | số liệu gốc user nhập, đơn vị ghi rõ trong payload |
| correctsEventId | string? | non-null khi type=CORRECTION, tự tham chiếu LedgerEvent khác |
| idempotencyKey | string | client-generated UUID, chống double-submit (COND-002) |
| createdAt | datetime | |

Quan hệ: không FK cứng tới BorrowPosition/AllocationLot (giữ lại nếu entity gốc có thay đổi khác trong tương lai), liên kết logic qua id.
Index/constraint quan trọng: unique(`userId`, `idempotencyKey`); index theo `userId`, `borrowPositionId`, `allocationLotId`. Append-only — không update/delete.
Lịch sử thay đổi: 2026-10-01 — thiết kế lần đầu tại architecture/capital-provenance-ledger.md. 2026-10-01 — migration `20261001062909_capital_provenance_ledger` áp dụng thật lên Postgres, chuyển PLANNED → IMPLEMENTED.

### PersonalCapitalDeclaration
Trạng thái: IMPLEMENTED
Owner feature: capital-provenance-ledger (architecture/capital-provenance-ledger.md revision: sha256:da81fdb2a2756da5e4fd9683f793df7aa2c39bd76b8f83917b3a979def7b83a2)
Phụ thuộc bởi: (chưa có feature nào khác)

**Deviation phát hiện khi implementation (không phải thay đổi chính sách nghiệp vụ)**: architecture.md mục "Financial formulas" tham chiếu `personalCapitalUsdt` (user tự khai báo, không suy từ balance Binance) nhưng không có bảng lưu trữ. Bảng này là nơi lưu tối thiểu, 1 dòng/user, cùng tinh thần với deviation `encryptionIvApiSecret` ở `BinanceConnection` — không đổi revision architecture.md vì đây là chi tiết storage, không phải AC/behavior/business-rule mới.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| userId | string (uuid) | PK, 1 dòng/user |
| amountUsdt | Decimal(36,2) | mặc định 0, user tự cập nhật qua `PUT /api/ledger/personal-capital` |
| updatedAt | datetime | |

Quan hệ: `userId` → User (feature user-authentication), không FK cứng (giống pattern BinanceConnection).
Index/constraint quan trọng: PK = userId (đảm bảo tối đa 1 dòng/user).
Lịch sử thay đổi: 2026-10-01 — phát hiện gap khi implementation (features/capital-provenance-ledger/implementation.md), migration `20261001063024_capital_provenance_ledger_personal_capital` áp dụng thật lên Postgres.

### Mẫu (copy khi thêm bảng mới)
```
### <TênBảng>
Trạng thái: PLANNED | IMPLEMENTED | DEPRECATED
Owner feature: <feature-slug> (architecture/<feature>.md revision: <hash>)
Phụ thuộc bởi: <feature khác nếu có>

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid | PK |

Quan hệ: <FK, 1-n, n-n>
Index/constraint quan trọng: <unique, composite index>
Lịch sử thay đổi: <ngày, feature/revision, tóm tắt thay đổi>
```

## Đã loại bỏ
*(chưa có)*
