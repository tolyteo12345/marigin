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
| BinanceConnection | PLANNED | binance-read-only-connection | Binance API key connection (encrypted) + trạng thái verify per-user | sha256:49b994bf10431bd82b1ce4f4d4f68a80b5ed60baeff29ed754814a3e63e01210 |
| ConnectionAuditLog | PLANNED | binance-read-only-connection | Audit log redacted cho add/verify/read/revoke connection | sha256:49b994bf10431bd82b1ce4f4d4f68a80b5ed60baeff29ed754814a3e63e01210 |
| User | PLANNED | user-authentication | Identity gốc; không chứa email/password trực tiếp (xem LocalCredential/TelegramIdentity) | sha256:6a4f01e3fbade29bbe3471d08d9ac48db553056eb58d497d8dc5efed4344b45b |
| LocalCredential | PLANNED | user-authentication | Email + password hash (argon2id) cho 1 User, tối đa 1/user ở MVP | sha256:6a4f01e3fbade29bbe3471d08d9ac48db553056eb58d497d8dc5efed4344b45b |
| TelegramIdentity | PLANNED | user-authentication | Telegram identity (telegramUserId) cho 1 User, tối đa 1/user ở MVP, telegramUserId unique toàn hệ thống | sha256:6a4f01e3fbade29bbe3471d08d9ac48db553056eb58d497d8dc5efed4344b45b |
| TelegramLoginRequest | PLANNED | user-authentication | Phiên đăng nhập/liên kết Telegram đang chờ, khớp bởi bot khi user gửi `/start <code>` (deep-link), ephemeral | sha256:6a4f01e3fbade29bbe3471d08d9ac48db553056eb58d497d8dc5efed4344b45b |
| Session | PLANNED | user-authentication | Session store cho `express-session` (custom `PrismaSessionStore`), ephemeral, không phải audit trail | sha256:6a4f01e3fbade29bbe3471d08d9ac48db553056eb58d497d8dc5efed4344b45b |
| AuthAuditLog | PLANNED | user-authentication | Audit log redacted cho register/login/logout/link-account | sha256:6a4f01e3fbade29bbe3471d08d9ac48db553056eb58d497d8dc5efed4344b45b |

Ghi chú: `BinanceConnection.userId` (string) là FK logic tới `User.id` (uuid) của feature `user-authentication` — đã xác nhận khớp kiểu khi `architecture/user-authentication.md` đạt READY (2026-09-29). Không thay đổi nội dung/revision của `architecture/binance-read-only-connection.md` vì contract `req.user.id`/cookie session/CSRF không đổi so với giả định ban đầu (BLOCKER-ARCH-001), chỉ có ghi chú tài liệu này được cập nhật.

## Chi tiết từng bảng

### BinanceConnection
Trạng thái: PLANNED
Owner feature: binance-read-only-connection (architecture/binance-read-only-connection.md revision: sha256:49b994bf10431bd82b1ce4f4d4f68a80b5ed60baeff29ed754814a3e63e01210)
Phụ thuộc bởi: (chưa có feature nào khác)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid | PK |
| userId | string (uuid) | FK tới User.id (feature user-authentication, architecture/user-authentication.md sha256:6a4f01e3fbade29bbe3471d08d9ac48db553056eb58d497d8dc5efed4344b45b) |
| label | string | |
| encryptedApiKey | bytes | AES-256-GCM ciphertext, không plaintext |
| encryptedApiSecret | bytes | AES-256-GCM ciphertext, không plaintext |
| encryptionIv | bytes | |
| encryptionKeyVersion | int | hỗ trợ key rotation |
| status | enum ConnectionStatus | PENDING_VERIFY \| VERIFIED \| INVALID \| UNSUPPORTED_ACCOUNT_MODE \| VERIFY_UNKNOWN \| REVOKED |
| accountType | string? | "MARGIN_1" \| "MARGIN_2" \| null |
| permissionSnapshot | json? | snapshot enableReading/enableMargin/... từ Binance, null nếu không xác định được |
| permissionUnknown | boolean | fail-closed flag khi không xác định được permission |
| lastError | string? | |
| lastVerifiedAt | datetime? | |
| createdAt / updatedAt | datetime | |
| deletedAt | datetime? | set cùng lúc null hoá secret khi revoke |

Quan hệ: `userId` → User (feature user-authentication, architecture READY, chưa implement).
Index/constraint quan trọng: index theo `userId`.
Lịch sử thay đổi: 2026-09-29 — thiết kế lần đầu tại architecture/binance-read-only-connection.md. 2026-09-29 — cập nhật ghi chú `userId` thành FK cụ thể tới User.id sau khi architecture/user-authentication.md READY (không đổi kiểu dữ liệu, không đổi revision của architecture này).

### ConnectionAuditLog
Trạng thái: PLANNED
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
Lịch sử thay đổi: 2026-09-29 — thiết kế lần đầu tại architecture/binance-read-only-connection.md.

### User
Trạng thái: PLANNED
Owner feature: user-authentication (architecture/user-authentication.md revision: sha256:6a4f01e3fbade29bbe3471d08d9ac48db553056eb58d497d8dc5efed4344b45b)
Phụ thuộc bởi: binance-read-only-connection (BinanceConnection.userId)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid | PK |
| createdAt / updatedAt | datetime | |

Quan hệ: 1-1 với LocalCredential (optional), 1-1 với TelegramIdentity (optional).
Index/constraint quan trọng: không có unique field ngoài PK ở bảng này (identity thật nằm ở LocalCredential/TelegramIdentity).
Lịch sử thay đổi: 2026-09-29 — thiết kế lần đầu tại architecture/user-authentication.md.

### LocalCredential
Trạng thái: PLANNED
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
Lịch sử thay đổi: 2026-09-29 — thiết kế lần đầu tại architecture/user-authentication.md.

### TelegramIdentity
Trạng thái: PLANNED
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
Lịch sử thay đổi: 2026-09-29 — thiết kế lần đầu tại architecture/user-authentication.md (Telegram Login Widget, có `photoUrl`). 2026-09-29 — đổi cơ chế Telegram sang bot deep-link (`/start <code>`): bỏ cột `photoUrl` (không có sẵn từ update Bot API mà không gọi thêm API), `firstName` đổi thành nullable (cùng lý do), cùng revision architecture mới.

### TelegramLoginRequest
Trạng thái: PLANNED
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
Lịch sử thay đổi: 2026-09-29 — thiết kế lần đầu tại architecture/user-authentication.md (thay thế cơ chế Telegram Login Widget/HMAC bằng bot deep-link).

### Session
Trạng thái: PLANNED
Owner feature: user-authentication (architecture/user-authentication.md revision: sha256:6a4f01e3fbade29bbe3471d08d9ac48db553056eb58d497d8dc5efed4344b45b)
Phụ thuộc bởi: (chưa có feature nào khác)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| sid | string | PK, session id từ express-session |
| data | string | JSON.stringify(session payload), chứa `userId` khi đã login và `loginAt` (dùng để enforce absolute TTL 30 ngày — BR-011) |
| expiresAt | datetime | rolling 7 ngày, gia hạn mỗi request active (BR-011) |

Quan hệ: không có FK cứng (session data tham chiếu userId trong JSON, không migrate-checked).
Index/constraint quan trọng: index theo `expiresAt` (dọn session hết hạn). Không phải append-only — bị xoá khi logout/hết hạn, không phải audit trail.
Lịch sử thay đổi: 2026-09-29 — thiết kế lần đầu tại architecture/user-authentication.md (custom PrismaSessionStore implement `express-session` Store interface).

### AuthAuditLog
Trạng thái: PLANNED
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
Lịch sử thay đổi: 2026-09-29 — thiết kế lần đầu tại architecture/user-authentication.md. 2026-09-29 — cập nhật danh sách `action` cho cơ chế Telegram bot deep-link (thay LOGIN_TELEGRAM_SUCCESS/FAILED bằng TELEGRAM_LOGIN_REQUEST_CREATED/CONFIRMED/CLAIMED/EXPIRED/TELEGRAM_WEBHOOK_REJECTED), cùng revision architecture mới.

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
