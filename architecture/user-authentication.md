# Architecture: user-authentication

Owner: architect-agent | Requirement revision: r3-2026-09-29 (sha256:1702d36a21ab7c886ad4287355ae3f2abd39a7484317783c4b7d27042638883e)
BA revision: sha256:f5e8a021b4023d2df33751ff8ef324e1a554d444a22fc5eebb6f30b4ab9c0982
Decision: features/user-authentication/decision.json

Thay đổi so với revision trước: đổi cơ chế đăng nhập Telegram từ Login Widget (HMAC verify) sang bot deep-link (`/start <code>`) theo yêu cầu mới của user. Phần local password/session/CSRF/rate-limit giữ nguyên không đổi.

Thay đổi so với revision trước (2): user chốt toàn bộ giá trị cấu hình nghiệp vụ còn OPEN_QUESTION (OQ-A05..A10) — thay các default tạm bằng giá trị cuối: rate-limit 5 lần/15 phút khoá 15 phút (BR-010), session rolling 7 ngày/tuyệt đối 30 ngày (BR-011), không bắt buộc email verification (BR-014), password tối thiểu 8 ký tự không ép ký tự đặc biệt (BR-015), không có forgot-password — RISK-A02 user đã accept (BR-016), user tự tạo/sở hữu bot Telegram qua env (OQ-A10 resolved). Không đổi schema/thiết kế, chỉ điền giá trị vào chỗ đã chừa sẵn.

## Gate check và scope
BA status: APPROVED_WITH_CONDITIONS (COND-A01..COND-A06, due tại gate này — xem cách từng điều kiện được giải quyết dưới). RISK-A01 (Telegram archive Login Widget cổ điển) **không còn áp dụng** — bot deep-link không phụ thuộc widget đó. RISK-A02 (không có forgot-password ở MVP) **đã được user accept** — không chặn DONE, chỉ cần ghi nhận. RISK-A03 (cần bot Telegram thật + webhook công khai trước khi smoke test) vẫn OPEN nhưng OQ-A10 đã resolved (user tự tạo bot, quản lý token qua env) nên không còn phụ thuộc quyết định ai sở hữu. OQ-A05..A10 đã RESOLVED (2026-09-29) — giá trị cụ thể đã điền vào BR-010/011/014/015/016, xem "User confirmation / modes / security / audit" bên dưới.

Contract bắt buộc mà `architecture/binance-read-only-connection.md` (BLOCKER-ARCH-001) đã giả định và feature này phải thoả mãn chính xác: `req.user.id` là string (uuid) đáng tin cậy per-request lấy từ session đã xác thực phía server, cookie session (httpOnly/secure/sameSite), CSRF token bắt buộc cho method thay đổi state. Thiết kế dưới đây đáp ứng đúng contract này — xem mục "Đối chiếu ngược với binance-read-only-connection" ở cuối.

## Components và dependency contracts
Stack bắt buộc theo quyết định user, giữ nhất quán với `binance-read-only-connection`: **Backend NestJS (TypeScript)**, **Frontend ReactJS**, **PostgreSQL + Prisma ORM**. Không đổi stack.

Modules (NestJS):
| Module | Trách nhiệm | Phụ thuộc |
|---|---|---|
| `AuthModule` | Orchestrate register/login/logout/me; áp dụng lockout/rate-limit trước khi gọi credential check | `LocalCredentialModule`, `TelegramBotModule`, `SessionStoreModule`, `AuditModule`, `PrismaModule` |
| `LocalCredentialModule` | Hash/verify password (argon2id), CRUD `LocalCredential` | `PrismaModule` |
| `TelegramBotModule` | Sinh `code` deep-link, gọi Telegram Bot API (`setWebhook` lúc bootstrap, `sendMessage` phản hồi user), nhận + verify webhook, khớp `/start <code>` với `TelegramLoginRequest`, CRUD `TelegramIdentity`/`TelegramLoginRequest` | `PrismaModule` — là boundary DUY NHẤT gọi Telegram Bot API (qua HTTPS `fetch` trực tiếp, không dùng thêm bot framework — xem BA EV-011) |
| `SessionStoreModule` | Cấu hình `express-session` middleware với `PrismaSessionStore` tự viết (implement `session.Store`), export `AuthGuard` đọc `req.session.userId` → gán `req.user = { id }` | `PrismaModule` |
| `CsrfModule` | Cấu hình `csrf-sync` (Synchronizer Token Pattern dựa trên session), expose `GET /api/auth/csrf-token`, guard áp cho mọi POST/PUT/DELETE (trừ webhook Telegram — xem API contracts) | `SessionStoreModule` |
| `RateLimitModule` | `@nestjs/throttler` global guard theo IP cho toàn bộ `/api/auth/*`; kết hợp lockout theo account trong `LocalCredentialModule` | Không phụ thuộc module khác |
| `AccountLinkModule` | Endpoint liên kết Telegram↔local vào `User` hiện tại của session, enforce BR-002/003/004 | `AuthModule`, `LocalCredentialModule`, `TelegramBotModule` |
| `AuditModule` | Ghi `AuthAuditLog` redacted cho mọi sự kiện auth | `PrismaModule` |
| Frontend `AuthFeature` (React) | `LoginForm`, `RegisterForm`, `TelegramLoginButton` (mở deep link + poll trạng thái), `AccountLinkPanel`, `LogoutButton` | Gọi REST API kèm CSRF token, không giữ password/token trong state lâu hơn thời gian request |

Ranh giới an toàn: `TelegramBotModule` là nơi DUY NHẤT gọi Telegram Bot API và xử lý webhook; không service nào khác được tin trực tiếp dữ liệu Telegram trước khi qua module này (khớp tinh thần "boundary an toàn duy nhất" của `BinanceReadOnlyAdapterModule` trong feature kia).

## Domain / storage / ledger
Đây KHÔNG phải ledger tài chính. Entity là identity/session/audit.

```prisma
model User {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  localCredential  LocalCredential?
  telegramIdentity TelegramIdentity?
}

model LocalCredential {
  id               String    @id @default(uuid())
  userId           String    @unique   // 1 local credential / user ở MVP (không multi-email/user)
  email            String    @unique   // login lookup key — không được yêu cầu multi-email
  passwordHash     String              // argon2id encoded string (salt+params nhúng trong chuỗi, không cột riêng)
  emailVerifiedAt  DateTime?           // null = chưa verify; OQ-A05 resolved: KHÔNG bắt buộc verify ở MVP nên cột này chưa được service layer check, giữ nullable cho tương lai
  failedLoginCount Int       @default(0)
  lockedUntil      DateTime?           // null = không bị khoá; ngưỡng OQ-A07 resolved = 5 lần/15 phút (đọc từ config AUTH_LOGIN_MAX_ATTEMPTS/AUTH_LOGIN_LOCKOUT_MINUTES, không hardcode trong schema)
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id])
}

model TelegramIdentity {
  id               String    @id @default(uuid())
  userId           String    @unique          // 1 Telegram identity / user ở MVP
  telegramUserId   BigInt    @unique          // Telegram numeric user id — tối đa 1 User trên toàn hệ thống (BR-002/BR-004)
  telegramUsername String?
  firstName        String?
  lastName         String?
  linkedAt         DateTime  @default(now())
  lastLoginAt      DateTime?

  user User @relation(fields: [userId], references: [id])
}

// Bản ghi phiên đăng nhập/liên kết Telegram đang chờ, khớp bởi bot khi user gửi /start <code>.
// code chính là start-parameter trong deep link (base64url, entropy cao, dùng làm PK luôn).
model TelegramLoginRequest {
  code                 String    @id                 // base64url(crypto.randomBytes(32)) — ràng buộc A-Za-z0-9_- và ≤64 ký tự của Telegram (BA EV-008) đã thoả mãn tự nhiên
  purpose              String              // LOGIN | LINK
  linkingUserId        String?             // set khi purpose=LINK: User.id của session đã đăng nhập lúc tạo request
  initiatorSessionSid  String              // sid của session (ẩn danh hoặc đã login) đã sinh code — bắt buộc khớp lúc claim (AC-005c)
  status               String    @default("PENDING") // PENDING | CONFIRMED | CLAIMED | EXPIRED | REJECTED
  telegramUserId       BigInt?             // điền khi bot nhận /start hợp lệ (status=CONFIRMED)
  telegramUsername     String?
  firstName            String?
  lastName             String?
  createdAt            DateTime  @default(now())
  expiresAt            DateTime            // createdAt + ngưỡng kỹ thuật (mặc định 300s, xem Concurrency)
  confirmedAt          DateTime?
  claimedAt            DateTime?

  @@index([initiatorSessionSid])
}

// Custom session store (PrismaSessionStore implements express-session's Store interface).
// Không dùng package cộng đồng nhỏ/1-maintainer (@quixo3 hoặc tương tự) cho một schema
// đơn giản 3 cột — giảm supply-chain risk, đổi lại backend tự chịu trách nhiệm implement
// get/set/destroy/touch đúng interface (chủ ý đơn giản hoá, không phải thiếu sót).
model Session {
  sid       String   @id
  data      String              // JSON.stringify(session payload), chứa userId khi đã login
  expiresAt DateTime

  @@index([expiresAt]) // cho job dọn session hết hạn (chạy on-demand hoặc cron ngoài scope MVP)
}

model AuthAuditLog {
  id                    String   @id @default(uuid())
  userId                String?  // null khi chưa xác định được user (vd. login sai email)
  action                String   // REGISTER_LOCAL | LOGIN_LOCAL_SUCCESS | LOGIN_LOCAL_FAILED | LOGIN_LOCAL_LOCKED | TELEGRAM_LOGIN_REQUEST_CREATED | TELEGRAM_LOGIN_CONFIRMED | TELEGRAM_LOGIN_CLAIMED | TELEGRAM_LOGIN_EXPIRED | TELEGRAM_WEBHOOK_REJECTED | LOGOUT | ACCOUNT_LINK_TELEGRAM | ACCOUNT_LINK_LOCAL | ACCOUNT_LINK_REJECTED | RATE_LIMITED
  result                String   // SUCCESS | FAILURE | REJECTED
  requestCorrelationId  String
  createdAt             DateTime @default(now())
  detailsRedacted       Json?    // KHÔNG BAO GIỜ chứa password/passwordHash/session secret/bot token/session id

  @@index([userId])
}
```

Append-only: `AuthAuditLog` không update/delete. `User`/`LocalCredential`/`TelegramIdentity` là mutable state nhưng lịch sử thay đổi tái tạo qua `AuthAuditLog`. `Session` và `TelegramLoginRequest` là ephemeral state (không phải audit trail — hết hạn/bị xoá sau khi dùng), không cần append-only; sự kiện quan trọng của `TelegramLoginRequest` (confirmed/claimed/rejected) vẫn được ghi lại qua `AuthAuditLog`.

**COND-A04 / OQ-A05 giải quyết**: user chốt KHÔNG bắt buộc email verification ở MVP — `emailVerifiedAt` vẫn giữ nullable trong schema (không xoá cột) để về sau nếu chính sách đổi, chỉ cần thêm check `emailVerifiedAt !== null` ở service layer, không cần migration.

## API contracts và state machines
Tất cả method thay đổi state yêu cầu CSRF token hợp lệ — **kể cả `POST /api/auth/register` và `POST /api/auth/login`**: client gọi `GET /api/auth/csrf-token` trước để lấy token gắn với session ẩn danh (pre-authentication), rồi gửi kèm token đó khi submit register/login (chống login CSRF, khớp UI "mọi form fetch CSRF token trước khi submit lần đầu"). Ngoại lệ DUY NHẤT là `POST /api/auth/telegram/webhook` (endpoint này không thuộc phiên trình duyệt nào — Telegram gọi trực tiếp, bảo vệ bằng secret token header thay vì CSRF).

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| GET | `/api/auth/csrf-token` | none (khởi tạo session ẩn danh nếu chưa có) | Trả CSRF token gắn với session hiện tại (ẩn danh hoặc đã login), client gọi trước mọi form submit |
| POST | `/api/auth/register` | CSRF | Body `{email, password}`. Validate password theo BR-015 (OQ-A08 resolved): tối thiểu 8 ký tự, không ép ký tự hoa/số/đặc biệt (NIST 800-63B). Tạo `User` + `LocalCredential` (argon2id hash), tạo session ngay (auto-login sau đăng ký, không cần email verification — BR-014 resolved), regenerate session id (chống session fixation) |
| POST | `/api/auth/login` | CSRF | Body `{email, password}`. Kiểm tra `lockedUntil` trước; nếu chưa khoá, verify password; đúng → reset `failedLoginCount`, regenerate session id rồi gán `userId` vào session (cookie `maxAge` rolling 7 ngày, tuyệt đối 30 ngày — BR-011 resolved, xem session cookie bên dưới); sai → tăng `failedLoginCount`, nếu vượt ngưỡng (config `AUTH_LOGIN_MAX_ATTEMPTS=5`, `AUTH_LOGIN_LOCKOUT_MINUTES=15` — BR-010/OQ-A07 resolved) set `lockedUntil = now + 15 phút`. Message lỗi luôn "email hoặc password không đúng" bất kể lý do |
| POST | `/api/auth/telegram/start` | session (ẩn danh được) + CSRF | Không có body cần thiết. Server đọc `req.session`: nếu đã có `userId` → tạo `TelegramLoginRequest{purpose: "LINK", linkingUserId: userId}`; nếu chưa → tạo `TelegramLoginRequest{purpose: "LOGIN", linkingUserId: null}`. Luôn set `initiatorSessionSid = req.session.id`, `code` random 256-bit base64url, `expiresAt = now + 300s`. Trả `{ code, deepLinkUrl: "https://t.me/<bot_username>?start=<code>", expiresAt }` |
| GET | `/api/auth/telegram/status/:code` | session (phải khớp `initiatorSessionSid`) | Đọc `TelegramLoginRequest`. Nếu `code` không tồn tại/hết hạn/`initiatorSessionSid` không khớp session hiện tại → trả `{status: "EXPIRED"}` (không phân biệt lý do, tránh lộ thông tin — AC-005c). Nếu `status=PENDING` → trả `{status: "PENDING"}`. Nếu `status=CONFIRMED` → **claim atomically** trong 1 transaction (`UPDATE ... WHERE code=? AND status='CONFIRMED'`): với `purpose=LOGIN`, tìm/tạo `User`+`TelegramIdentity` theo `telegramUserId`, regenerate session id, gán `userId` vào session; với `purpose=LINK`, kiểm tra `telegramUserId` chưa thuộc `TelegramIdentity` khác rồi gắn vào `linkingUserId` (= `req.user.id` hiện tại, phải khớp); set `status=CLAIMED`; trả `{status: "CLAIMED"}` hoặc `{status: "REJECTED", reason}` nếu `telegramUserId` đã bị người khác chiếm giữa lúc CONFIRMED và claim (race hiếm, BR-004) |
| POST | `/api/auth/telegram/webhook` | secret token header (không session/CSRF) | Nhận `Update` từ Telegram. Verify header `X-Telegram-Bot-Api-Secret-Token` khớp `TELEGRAM_WEBHOOK_SECRET_TOKEN` trước tiên — sai → 401, ghi `AuthAuditLog` action `TELEGRAM_WEBHOOK_REJECTED`, không xử lý gì thêm. Đúng → parse `message.text` dạng `/start <code>`; `UPDATE TelegramLoginRequest SET status='CONFIRMED', telegramUserId=?, ... WHERE code=? AND status='PENDING' AND expiresAt > now()` (điều kiện WHERE làm atomic + chống xử lý trùng khi Telegram gửi lại webhook); nếu update thành công → `sendMessage` phản hồi "Xác nhận thành công, quay lại trình duyệt để tiếp tục"; nếu không có row nào khớp (code sai/hết hạn/đã dùng) → `sendMessage` phản hồi "Mã không hợp lệ hoặc đã hết hạn, vui lòng thử lại từ trình duyệt". Luôn trả HTTP 200 cho Telegram (kể cả khi code sai) để tránh Telegram lặp lại gửi update |
| POST | `/api/auth/logout` | session + CSRF | Xoá `Session` record khỏi store (`req.session.destroy()`), clear cookie |
| GET | `/api/auth/me` | session | Trả `{ userId, hasLocalCredential: bool, hasTelegramIdentity: bool, localEmailMasked?: string }` — đủ cho UI hiển thị trạng thái để quyết định hiện nút "liên kết" nào |
| POST | `/api/auth/link/local` | session + CSRF | Body `{email, password}`. Trong 1 transaction: nếu `email` đã thuộc `LocalCredential` khác → 409 (BR-004); nếu current user đã có `LocalCredential` → 409; ngược lại hash password, tạo `LocalCredential` gắn `userId = req.user.id` |

Liên kết Telegram (US-004/AC-007) dùng chung `POST /api/auth/telegram/start` + `GET /api/auth/telegram/status/:code` ở trên (không có endpoint `/link/telegram` riêng) — phân biệt bằng `purpose` được server tự suy ra từ session lúc tạo request, không nhận từ client.

Identity attach là one-way (once linked, permanent ở MVP; "unlink" không được yêu cầu, không thiết kế). Có 2 state machine:

Lockout (không đổi):
```
LocalCredential.lockedUntil = null --(login sai đủ ngưỡng)--> lockedUntil = now + LOCKOUT_DURATION
lockedUntil = <future> --(login request bất kỳ, kể cả đúng password)--> từ chối "tài khoản tạm khoá, thử lại sau" cho tới khi now > lockedUntil
lockedUntil = <past hoặc null> --(login đúng)--> failedLoginCount = 0, lockedUntil = null
```

`TelegramLoginRequest.status` (mới):
```
PENDING --(webhook nhận /start <code> hợp lệ, còn hạn)--> CONFIRMED (lưu telegramUserId/username/name)
PENDING --(quá expiresAt, kiểm tra lazy lúc webhook/status)--> EXPIRED
CONFIRMED --(browser đúng initiatorSessionSid poll status, claim thành công)--> CLAIMED
CONFIRMED --(browser đúng initiatorSessionSid poll status, nhưng telegramUserId đã bị chiếm bởi user khác giữa chừng — BR-004)--> REJECTED
CONFIRMED --(quá expiresAt mà chưa claim)--> EXPIRED
{PENDING/CONFIRMED/EXPIRED/REJECTED/CLAIMED} --(webhook nhận thêm /start <code> trùng)--> no-op (WHERE status='PENDING' không khớp nữa, chỉ trả lời user qua sendMessage, không đổi state)
```

## Financial formulas
Không áp dụng.

## Concurrency / idempotency
- **Link race (BR-004)**: unique constraint `TelegramIdentity.telegramUserId` và `TelegramIdentity.userId`, `LocalCredential.email` và `LocalCredential.userId` ở tầng DB (Postgres unique index) là tuyến phòng thủ chính — 2 request link cùng lúc cùng 1 identity vào 2 user khác nhau, request thứ 2 nhận Prisma unique constraint violation → map thành 409 rõ ràng, không phải 500. Không dựa vào application-level check-then-write (TOCTOU) làm tuyến phòng thủ duy nhất.
- **Login lockout counter**: `failedLoginCount` update qua `prisma.localCredential.update({ data: { failedLoginCount: { increment: 1 } } })` (atomic ở DB), không đọc-sửa-ghi ở application layer. Đây là cơ chế chống abuse, không phải financial invariant — chấp nhận race hiếm giữa "đọc lockedUntil" và "ghi tăng counter" có thể cho phép 1 request thừa lọt qua trước khi khoá kích hoạt (**chủ ý đơn giản hoá, trần: tối đa 1 request vượt ngưỡng trong race window hẹp, không ảnh hưởng bảo mật cốt lõi vì vẫn có `@nestjs/throttler` theo IP chặn song song**).
- **Session store**: `PrismaSessionStore.set/get/destroy` implement theo interface `express-session` (đồng bộ hoá qua Postgres row, không cache thêm ở memory) — nhất quán multi-instance backend nếu scale ngang sau này (khác với rate-limit in-memory của binance feature vốn chỉ single-instance).
- **Telegram webhook duplicate delivery**: Telegram có thể gửi lại cùng 1 update nếu không nhận HTTP 200 kịp thời. `UPDATE ... WHERE code=? AND status='PENDING'` (điều kiện WHERE, không phải read-then-write) đảm bảo chỉ lần xử lý đầu tiên đổi state — lần gửi lại chỉ nhận 0 row affected, không confirm 2 lần, không gửi `sendMessage` trùng nội dung thành công.
- **Telegram code claim race**: `status: CONFIRMED -> CLAIMED` cũng dùng `UPDATE ... WHERE code=? AND status='CONFIRMED'` trong transaction — 2 request `GET /telegram/status/:code` gần như đồng thời (double-poll hoặc 2 tab) chỉ 1 request thắng chuyển state, request còn lại đọc lại thấy `CLAIMED`/`REJECTED` và trả kết quả tương ứng, không tạo 2 session/2 lần login cho cùng 1 `code`.
- **Telegram code expiry**: mặc định kỹ thuật 300 giây kể từ `createdAt` (tương tự lý do trước đây từng dùng cho `auth_date` — không ép buộc bởi Telegram, do architecture chọn dựa trên trải nghiệm hợp lý cho thao tác chuyển app, không phải business policy cần user chốt). Kiểm tra lazy (`expiresAt < now()`) tại cả webhook handler và status endpoint, không cần cron riêng ở MVP (**chủ ý đơn giản hoá, trần: request đã hết hạn không bị dọn khỏi bảng ngay, chỉ không thể dùng — dọn định kỳ là cải tiến sau nếu bảng phình to**).
- **Code hijack protection (AC-005c)**: `initiatorSessionSid` lưu tại lúc tạo `code`; endpoint `status` bắt buộc `req.session.id === initiatorSessionSid` mới cho claim — 1 bên thứ ba biết được `code` (dù entropy 256-bit khiến việc đoán gần như bất khả thi, đây là defense-in-depth) không thể tự poll bằng trình duyệt/session khác để cướp kết quả.

## User confirmation / modes / security / audit
- Không có PAPER_TRADING/LIVE trong scope — feature không giao dịch.
- **Password**: argon2id, tham số baseline OWASP (EV-001): memory 19 MiB tối thiểu — architecture chọn 64 MiB / iterations 3 / parallelism 1 làm cấu hình mặc định production (giữa baseline tối thiểu và khuyến nghị mạnh, cân bằng CPU cost cho hosted single-tenant-per-request server; COND-A03 resolved). Password không bao giờ log; DTO tách riêng (`LoginDto`, `RegisterDto`) để interceptor redact không vô tình log field `password`.
- **Session cookie**: `httpOnly: true`, `secure: true` khi `NODE_ENV=production` (yêu cầu `app.set('trust proxy', 1)` nếu sau reverse proxy — EV-004), `sameSite: 'lax'` (deep link Telegram mở ở tab/app riêng — không phải redirect cross-site quay lại domain app như cách widget cũ, nên không còn ràng buộc kỹ thuật bắt buộc `lax` vì lý do đó; vẫn chọn `lax` làm default vì cân bằng hợp lý giữa chống CSRF và trải nghiệm — top-level GET navigation thông thường như mở link trực tiếp/bookmark vẫn hoạt động, trong khi POST cross-site vẫn bị chặn cookie).
- **Session TTL** (BR-011 resolved: rolling 7 ngày, tuyệt đối 30 ngày): `express-session({ rolling: true, cookie: { maxAge: 7 * 24 * 3600 * 1000 } })` tự gia hạn cookie mỗi request active (rolling 7 ngày). Vì `express-session` không có sẵn absolute cap, `Session` record lưu thêm mốc thời điểm login gốc bên trong `data` JSON (`loginAt`); `AuthGuard` kiểm tra `now - loginAt > 30 ngày` mỗi request — nếu vượt, `req.session.destroy()` và trả 401 dù cookie chưa hết hạn theo rolling window (chặn absolute cap đúng nghĩa, không chỉ dựa vào cookie `maxAge`).
- **Session fixation**: mọi lần chuyển từ "chưa xác thực" sang "đã xác thực" (login local thành công, hoặc claim Telegram thành công) đều phải regenerate session id (`req.session.regenerate()` hoặc tương đương) trước khi gán `userId`, không tái sử dụng session id đã tồn tại trước đó — kể cả khi id đó là `initiatorSessionSid` từng dùng để sinh `TelegramLoginRequest`. Áp dụng chung cho local login và Telegram claim, không riêng luồng nào.
- **CSRF**: `csrf-sync` (Synchronizer Token Pattern, EV-006a; KHÔNG dùng `csurf` đã deprecated — COND-A01 resolved). Token lưu trong `req.session`, client lấy qua `GET /api/auth/csrf-token` trước khi submit form; do `saveUninitialized: false`, session chỉ thực sự persist xuống `Session` table khi có dữ liệu ghi vào (CSRF token hoặc sau login) — tránh tạo rác session row cho mọi visitor ẩn danh không tương tác.
- **Session store**: Postgres-backed `PrismaSessionStore` tự viết thay MemoryStore (COND-A02 resolved, bắt buộc theo EV-003 vì hosted multi-user production). Logout = `req.session.destroy()` → xoá row khỏi `Session` table ngay (AC-009), không chỉ chờ hết hạn tự nhiên.
- **Telegram webhook trust boundary** (`TelegramBotModule`, theo EV-009/EV-010 — COND-A05 resolved):
  1. Mọi request tới `POST /api/auth/telegram/webhook` phải có header `X-Telegram-Bot-Api-Secret-Token` khớp chính xác `TELEGRAM_WEBHOOK_SECRET_TOKEN` đã cấu hình lúc `setWebhook` — sai/thiếu → 401 ngay, không đọc/parse body, ghi `AuthAuditLog` action `TELEGRAM_WEBHOOK_REJECTED`.
  2. Khi header đúng, dữ liệu `update.message.from` (id, first_name, username...) được tin trực tiếp — đây là dữ liệu Telegram server điền vào, không phải client-supplied, nên KHÔNG cần thêm bước verify chữ ký nào khác (khác với cách cũ dùng HMAC trên payload widget).
  3. `code` trong `/start <code>` chỉ được chấp nhận nếu khớp đúng 1 `TelegramLoginRequest.status='PENDING'` còn hạn (`expiresAt > now()`) — xem state machine và Concurrency.
- **Code generation** (COND-A06 resolved): `code = base64url(crypto.randomBytes(32))` — 256-bit entropy, không đoán được bằng brute-force trong thời hạn 300 giây; dùng trực tiếp làm PK của `TelegramLoginRequest` và làm start-parameter (thoả ràng buộc ký tự/độ dài của EV-008).
- **Secret management**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET_TOKEN`, và session signing secret (`express-session({ secret })`) lấy qua biến môi trường không commit / secret manager của môi trường deploy (khớp pattern đã duyệt ở `docs/BINANCE_INTEGRATION.md`), không hardcode, không log (OQ-A04 resolved).
- **Rate limit**: `@nestjs/throttler` (EV-007) global guard áp `/api/auth/login`, `/api/auth/register`, `/api/auth/telegram/start` theo IP (default tạm: 10 request/phút/IP cho các route này — giá trị cụ thể là tuning kỹ thuật, có thể chỉnh qua config, không phải OQ-A07 vốn nói về ngưỡng lockout theo ACCOUNT). `/api/auth/telegram/webhook` KHÔNG áp rate-limit theo IP người dùng cuối (nguồn gọi luôn là hạ tầng Telegram, không phải browser) nhưng vẫn giới hạn tốc độ xử lý ở mức hợp lý để tránh flood nếu secret token bị lộ. Kết hợp lockout theo account (`LocalCredential.failedLoginCount`/`lockedUntil`) chống brute-force phân tán nhiều IP nhắm 1 account cụ thể (BR-010).
- **Audit**: mọi request qua `AuthModule`/`AccountLinkModule` ghi `AuthAuditLog` với `requestCorrelationId` (UUID per-request), `detailsRedacted` không bao giờ chứa password/hash/token/session id — chỉ chứa thông tin không nhạy cảm (vd. `{ email: "<masked>", reason: "PASSWORD_MISMATCH" }`).

## UI handoff
React components:
- `LoginForm`: tab "Email/Password" và nút riêng "Đăng nhập với Telegram". Lỗi hiển thị message chung, không phân biệt "sai email" vs "sai password" vs "đang bị khoá tạm thời" (BR-010 AC-004) — chỉ 1 thông báo trung tính.
- `RegisterForm`: input email/password, hiển thị rule password: "tối thiểu 8 ký tự" (BR-015, đã chốt).
- `TelegramLoginButton`: bấm → gọi `POST /api/auth/telegram/start`, mở `deepLinkUrl` ở tab mới (không unload trang hiện tại), hiển thị trạng thái "Đang chờ xác nhận trên Telegram..." kèm đếm ngược tới `expiresAt`, poll `GET /api/auth/telegram/status/:code` mỗi ~2 giây; `CLAIMED` → điều hướng như đã đăng nhập; `REJECTED` → hiển thị lý do (ví dụ "tài khoản Telegram này đã được liên kết với người khác"); `EXPIRED` → hiện nút "Tạo mã mới" (gọi lại `/telegram/start`).
- `AccountLinkPanel` (chỉ hiện khi đã đăng nhập): gọi `GET /api/auth/me`, hiện trạng thái 2 phương thức, nút "Liên kết Telegram" (dùng lại `TelegramLoginButton`, server tự suy `purpose=LINK` từ session) hoặc "Thêm email + password" (form gửi tới `/api/auth/link/local`). Lỗi 409/REJECTED hiển thị "phương thức này đã được liên kết với một tài khoản khác" — không tiết lộ thêm chi tiết account kia.
- `LogoutButton`: gọi `POST /api/auth/logout` kèm CSRF token, sau đó redirect về trang login.
- Toàn bộ form fetch CSRF token qua `GET /api/auth/csrf-token` trước khi submit lần đầu trong phiên trang.

## Validation và rollout
| AC | Component | Test plan |
|---|---|---|
| AC-001 | `LocalCredentialModule.register` | Test đăng ký → `LocalCredential.passwordHash` không phải plaintext, `argon2.verify` đúng |
| AC-002 | `AuthModule.register` unique check | Test đăng ký trùng email → 409, không tạo `User` mới |
| AC-003 | `SessionStoreModule` + `AuthGuard` | Test login → cookie có `httpOnly/secure/sameSite` đúng flag (kiểm bằng `Set-Cookie` header trong test); request kế tiếp tới endpoint có `AuthGuard` trả đúng `req.user.id` |
| AC-004 | Lockout state machine | Test: sai password 5 lần (`AUTH_LOGIN_MAX_ATTEMPTS=5`) trong 15 phút → lần thứ 6 dù đúng password vẫn bị từ chối "tạm khoá" tới khi hết `lockedUntil` (15 phút); message không đổi giữa các loại lỗi |
| AC-005 | `TelegramBotModule.start` + webhook handler | Test: tạo `code` qua `/telegram/start`, giả lập webhook payload đúng `secret_token` + `/start <code>` hợp lệ còn hạn → `TelegramLoginRequest` chuyển CONFIRMED; poll `/status/:code` cùng session → CLAIMED, session có `userId` |
| AC-005b | Webhook + status handler | Test webhook với `code` sai/hết hạn → không đổi state, bot trả lời lỗi (giả lập `sendMessage` bị gọi với message lỗi); test poll `/status/:code` với `code` đã CLAIMED trước đó → không login lại lần 2 |
| AC-005c | Status handler session binding | Test tạo `code` bằng session A, gọi `/status/:code` bằng session/cookie B (giả lập trình duyệt khác) → không claim được, trả EXPIRED/không tiết lộ trạng thái thật |
| AC-006 | `TelegramBotModule` + `AuthModule` | Test `telegramUserId` mới → tạo `User` mới, KHÔNG query theo email/username nào để tìm user cũ trùng |
| AC-007 | `TelegramBotModule.start` với `purpose=LINK` | Test link Telegram chưa ai sở hữu (session đã login trước khi gọi `/telegram/start`) → thành công; test Telegram đã thuộc user khác → claim trả REJECTED, `TelegramIdentity.userId` cũ không đổi |
| AC-008 | `AccountLinkModule.linkLocal` | Test thêm local credential mới vào Telegram-only user → thành công; test email đã tồn tại ở user khác → 409, không gộp |
| AC-009 | `SessionStoreModule.destroy` | Test logout → `Session` row bị xoá; request sau bằng cookie cũ → 401 |
| AC-010 | `CsrfModule` guard | Test POST thiếu/sai CSRF token → 403, không có side effect (không tạo user/session) |
| AC-011 | `AuthGuard` | Test cố truyền `userId` khác trong body của request đã có session → giá trị bị bỏ qua, `req.user.id` vẫn là user của session |
| Edge case: concurrent link race | Unique constraint DB + claim transaction | Test 2 `code` khác nhau cố link cùng `telegramUserId` gần như đồng thời (Promise.all vào bước claim) → đúng 1 thành công (CLAIMED), request/poll còn lại nhận REJECTED, không có 2 user cùng sở hữu 1 `TelegramIdentity` |
| Edge case: webhook forgery | Webhook secret token check | Test POST tới `/telegram/webhook` thiếu hoặc sai `X-Telegram-Bot-Api-Secret-Token` → 401, không tạo/đổi `TelegramLoginRequest` nào, ghi `AuthAuditLog` `TELEGRAM_WEBHOOK_REJECTED` |
| Edge case: webhook duplicate delivery | Conditional UPDATE WHERE status='PENDING' | Test gửi cùng 1 update webhook 2 lần liên tiếp (giả lập Telegram retry) → chỉ lần đầu đổi state PENDING→CONFIRMED, lần 2 không có row nào bị ảnh hưởng, không gọi `sendMessage` thành công 2 lần |

Trước khi coi DONE: 1 lần manual smoke test với bot Telegram thật (đã đăng ký qua BotFather, webhook trỏ về domain thật có HTTPS hợp lệ) để xác nhận toàn bộ luồng deep-link → `/start` → claim hoạt động đúng như thiết kế (RISK-A03 mitigation), evidence ghi ở `qa/user-authentication.md`. Không có LIVE activation (không áp dụng khái niệm LIVE cho feature identity). Rollback: revoke bằng cách vô hiệu hoá tài khoản không nằm trong scope MVP (không được yêu cầu) — rollback chỉ ở mức migration Prisma chuẩn.

## Đối chiếu ngược với binance-read-only-connection
`architecture/binance-read-only-connection.md` (BLOCKER-ARCH-001) giả định: "cần một session xác thực người dùng hợp lệ, per-request userId đáng tin cậy", "cookie session (NestJS `express-session` hoặc tương đương) + CSRF token (NestJS `csurf`-tương đương)". Đối chiếu với thiết kế trên:
- `req.user.id`: khớp chính xác — `AuthGuard` của `SessionStoreModule` gán `req.user = { id: <User.id uuid string> }` từ session, đúng kiểu `userId String` mà `BinanceConnection.userId` đang tham chiếu.
- Cookie session: khớp — cùng `express-session`.
- CSRF: **khác chi tiết cụ thể so với câu chữ gốc** — feature kia viết "`csurf`-tương đương" (đã biết `csurf` deprecated, không chốt cứng), feature này chọn cụ thể `csrf-sync`. Đây KHÔNG phải thay đổi giả định kiến trúc (contract "có CSRF token, verify được ở backend" không đổi), chỉ là chọn thư viện cụ thể — không cần invalidate `architecture/binance-read-only-connection.md` theo quy tắc Invalidation của `workflows/feature-development.md` (không có thay đổi nội dung thiết kế của feature đó, chỉ hoàn thiện một chi tiết trước đó để ngỏ).
- **Cần cập nhật `docs/DATABASE.md`**: ghi chú `BinanceConnection.userId` hiện "chưa xác định chính xác — phụ thuộc feature user-authentication" phải đổi thành FK cụ thể tới `User.id` (uuid, bảng `User` của feature này). Đã thực hiện trong cùng lần ghi artifact này — xem `docs/DATABASE.md`.
- Không cần thay đổi nội dung/revision của `architecture/binance-read-only-connection.md` — chỉ có `docs/DATABASE.md` (tài liệu dùng chung) được cập nhật ghi chú, đây là editorial gắn thêm thông tin đã biết trước, không phải đổi thiết kế.

## Open decisions và readiness
- RISK-A01: **không còn áp dụng** — đổi sang bot deep-link đã loại bỏ phụ thuộc vào Telegram Login Widget cổ điển (đã bị Telegram archive).
- RISK-A02: **user đã accept** (2026-09-29) — không có forgot-password ở MVP, user mất local credential chưa link Telegram sẽ mất quyền truy cập vĩnh viễn qua đường local. Ghi nhận là residual risk đã accept, không chặn DONE.
- RISK-A03: vẫn OPEN nhưng không còn phụ thuộc quyết định "ai sở hữu bot" (OQ-A10 đã resolved: user tự tạo bot qua BotFather, tự quản lý token qua env) — chỉ còn phụ thuộc thao tác vận hành thực tế (tạo bot, cấu hình webhook HTTPS) trước khi chạy manual smoke test ở QA gate.
- OQ-A05/A06/A07/A08/A09/A10: **tất cả đã RESOLVED** (2026-09-29) — giá trị cụ thể đã điền vào BR-010 (rate-limit 5/15 phút, khoá 15 phút), BR-011 (session rolling 7 ngày/tuyệt đối 30 ngày), BR-014 (không bắt buộc email verification), BR-015 (password tối thiểu 8 ký tự), BR-016 (không có forgot-password, RISK-A02 accepted), và vận hành bot Telegram (user tự tạo, quản lý qua env). Không còn OPEN_QUESTION nào chặn implementation.
- COND-A01/A02/A03/A04/A05/A06: RESOLVED — chi tiết ở các mục trên.

**Đề xuất architecture_status: READY.** Không còn blocker ảnh hưởng THIẾT KẾ, và không còn open question nghiệp vụ nào chặn implementation (tất cả OQ-A05..A10 đã resolved). Còn lại: RISK-A03 (thao tác vận hành tạo bot thật + webhook HTTPS trước smoke test, không chặn thiết kế) cần thực hiện trước QA gate. Coordinator dừng lại sau gate này theo yêu cầu user — không tự dispatch backend/frontend-agent, chờ user xác nhận muốn chuyển sang IMPLEMENTATION.
