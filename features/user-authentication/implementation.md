# Implementation: user-authentication

Owner: coordinator (tổng hợp từ backend-agent + frontend-agent) | Architecture revision: sha256:6a4f01e3fbade29bbe3471d08d9ac48db553056eb58d497d8dc5efed4344b45b
Requirement revision: r3 sha256:1702d36a21ab7c886ad4287355ae3f2abd39a7484317783c4b7d27042638883e
Decision: features/user-authentication/decision.json

## Trạng thái tổng quan
Implementation **IN_PROGRESS**, chưa READY. Code backend + frontend đã viết đầy đủ theo scope, build sạch, unit test pass. Đã verify chạy thật với Postgres thật (Docker) cho từng endpoint qua curl/Postman (xem mục "API documentation" và "Việc còn lại" bên dưới) — vẫn còn thiếu integration test tự động (Supertest) và chạy 2 server thật (backend+frontend) nối với nhau trước khi coi implementation READY.

## API documentation (Swagger + Postman)
Theo yêu cầu user 2026-09-29 ("API đang không có document..."), đã bổ sung và cập nhật `AGENTS.md`/`workflows/feature-development.md` để bắt buộc mọi thay đổi API từ nay phải kèm Swagger + Postman:
- **Swagger**: cài `@nestjs/swagger@^8` (bản tương thích Nest 10, không dùng bản 11/12 vì yêu cầu Nest 11+). `main.ts` mount `SwaggerModule` tại `/api/docs` (JSON tại `/api/docs-json`) chỉ khi `NODE_ENV !== 'production'`. Thêm `@ApiTags/@ApiOperation/@ApiResponse/@ApiCookieAuth` cho toàn bộ 8 endpoint public và `@ApiProperty` cho `RegisterDto/LoginDto/LinkLocalDto`. Endpoint `POST /auth/telegram/webhook` dùng `@ApiExcludeEndpoint()` vì đây là Telegram Bot API gọi vào (không phải contract cho client của mình), không phải thiếu sót.
- **Postman**: `backend/postman/margin-trading-auth.postman_collection.json`, 3 folder (`auth`, `account-link`, `telegram`) khớp đúng 9 route thật (kể cả `webhook`, đưa vào để test thủ công dù exclude khỏi Swagger). Request POST cần CSRF có `prerequest` script tự gọi `GET /auth/csrf-token` lấy token mới ngay trước khi gửi (đúng hành vi thật: `login` gọi `regenerateSession` nên token cũ từ session trước sẽ bị 403 nếu tái dùng).
- **Bằng chứng đã tự chạy lại để xác minh** (Postgres thật qua `docker compose up -d postgres` + `prisma migrate deploy`, backend chạy thật bằng `npm run start`, verify bằng `newman run backend/postman/margin-trading-auth.postman_collection.json`): toàn bộ flow `csrf-token → register → login → me → logout`, `telegram/start → telegram/status/:code` (PENDING), `account-link/local` (401 đúng khi chưa đăng nhập) trả đúng status code như Swagger doc mô tả. `webhook` trả 401 khi thiếu secret header (đúng thiết kế, không test được CLAIMED thật vì cần bot Telegram thật — thuộc QA gate, xem mục "Việc còn lại" #4).
- Do cần chạy migration thật để verify Swagger response chính xác, đã tiện thể hoàn tất mục 1 của "Việc còn lại" bên dưới (xem `docs/DATABASE.md`, 6 bảng user-authentication đã IMPLEMENTED).

## Backend (`backend/`, NestJS + Prisma)
Cấu trúc module đúng theo architecture: `PrismaModule`, `AuthConfigModule`, `SessionStoreModule` (custom `PrismaSessionStore`), `CsrfModule` (csrf-sync), `RateLimitModule` (@nestjs/throttler), `LocalCredentialModule` (argon2id), `TelegramBotModule` (gọi thẳng Bot API qua `fetch`, không dùng bot framework), `AccountLinkModule`, `AuditModule`, `AuthModule`.

Toàn bộ 9 endpoint theo API contract đã implement: `GET /api/auth/csrf-token`, `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/telegram/start`, `GET /api/auth/telegram/status/:code`, `POST /api/auth/telegram/webhook`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/link/local`.

**Bằng chứng kiểm thử (đã tự chạy lại để xác minh, không chỉ tin báo cáo agent)**:
```
cd backend && npm test
Test Suites: 4 passed, 4 total
Tests:       35 passed, 35 total
```
Toàn bộ dùng `jest-mock-extended` mock `PrismaService` — KHÔNG kết nối DB thật. `npx tsc --noEmit` và `npx nest build` cũng chạy sạch (đã verify). Test bao phủ: argon2id hash/verify, lockout state machine (atomic increment, 5 lần/15 phút), `TelegramLoginRequest` code generation (base64url, entropy, không trùng) và state machine atomic (`PENDING→CONFIRMED` chống duplicate webhook, `CONFIRMED→CLAIMED/REJECTED` chống race cho cả LOGIN/LINK, session-hijack binding AC-005c), `AuthGuard` (session TTL rolling 7 ngày + absolute cap 30 ngày), 4 method của `PrismaSessionStore`.

**Hạ tầng Docker cho local dev (bổ sung sau khi user yêu cầu)**: `backend/docker-compose.yml` (service `postgres:16-alpine`, credentials khớp sẵn `DATABASE_URL` trong `.env.example`, named volume, healthcheck), `backend/README.md` (hướng dẫn từng bước), thêm script `db:up`/`db:down`/`prisma:migrate:deploy`/`prisma:migrate:dev` vào `package.json`. **Chưa verify được bằng cách chạy thật trong sandbox này** — Docker daemon không chạy ở đây (`docker info` fail); cần user tự `docker compose up -d postgres` trên máy họ (Docker Desktop phải đang chạy) rồi báo lại để coordinator chạy migration/integration test thật, hoặc tự chạy theo README.

**Chưa làm/chưa verify được (cần Postgres thật)**:
- `prisma/migrations/20260929000000_init/migration.sql` mới **sinh bằng `prisma migrate diff --from-empty`, CHƯA `migrate deploy` lên DB thật**. `docs/DATABASE.md` giữ nguyên PLANNED cho tới khi chạy migration thật (đúng thẩm quyền — backend-agent không tự đổi sang IMPLEMENTED).
- Chưa có integration test chạm DB thật (unique constraint 409 thật, round-trip register→login, Session/AuthAuditLog thật trong Postgres) và chưa có test tầng HTTP (Supertest).
- `npm audit`: 22 vulnerabilities (4 low/11 moderate/7 high) từ transitive deps của NestJS CLI/schematics toolchain — chưa xử lý, cần quyết định có audit fix trước production hay không (không ảnh hưởng runtime, chỉ devDependencies).
- `cookie-parser`/`@types/cookie-parser` có trong `package.json` nhưng không dùng trong code (express-session tự quản cookie) — dependency thừa, nên gỡ ở lần dọn dẹp kế tiếp.

**Vấn đề phát hiện và đã xử lý**: backend-agent phát hiện mâu thuẫn trong architecture doc (câu mở đầu mục "API contracts" liệt kê register/login là CSRF-exempt, nhưng bảng API lại yêu cầu CSRF cho cả hai). Coordinator đã xác nhận bảng API + thiết kế UI ("mọi form fetch CSRF token trước submit") là đúng ý định, sửa lại câu mở đầu cho khớp (architecture revision mới: sha256:6a4f01e3fbade29bbe3471d08d9ac48db553056eb58d497d8dc5efed4344b45b). Implementation backend đã làm đúng theo bảng (CSRF bắt buộc cho register/login) nên không cần sửa code.

## Frontend (`frontend/`, React + Vite + TS)
Component: `LoginForm` (tab Email/Password + Telegram, lỗi trung tính cố định phía client — không hiển thị message backend trả về để tránh leak), `RegisterForm` (hiển thị rule "tối thiểu 8 ký tự"), `TelegramLoginButton` (start → mở tab mới → poll 2s → xử lý đủ PENDING/CLAIMED/REJECTED/EXPIRED + đếm ngược), `AccountLinkPanel` (đọc `/me`, hiện đúng nút link), `LogoutButton`. API client `src/api/authClient.ts` quản lý CSRF token + `credentials: 'include'`.

**Bằng chứng kiểm thử (đã tự chạy lại để xác minh)**:
```
cd frontend && npm test -- --run
Test Files  3 passed (3)
Tests       8 passed (8)
```
`npx tsc -b` và `npm run build` cũng pass. Toàn bộ mock `fetch`, không cần backend thật chạy.

**Đối chiếu giả định frontend ↔ backend thật (đã verify bằng code, không phải suy đoán)**:
| Giả định frontend | Backend thật | Khớp? |
|---|---|---|
| Header CSRF `x-csrf-token` | `csrf.service.ts` dùng đúng `x-csrf-token` | ✅ |
| `GET /csrf-token` → `{csrfToken: string}` | `csrf.controller.ts` trả đúng `{csrfToken}` | ✅ |
| `GET /telegram/status/:code` → `{status, reason?}` | `telegram-bot.controller.ts` trả đúng shape, `reason` chỉ có khi REJECTED | ✅ |
| `GET /me` → `{userId, hasLocalCredential, hasTelegramIdentity, localEmailMasked?}` | `auth.service.ts` `MeResult` khớp chính xác | ✅ |

Không có sai lệch integration nào giữa 2 phần cần sửa.

**Chưa làm được**: chưa có integration test thật nối 2 phần qua HTTP (cần backend chạy thật với DB), chưa test cookie `httpOnly/secure/sameSite` qua trình duyệt thật.

## Việc còn lại trước khi implementation_status = READY
1. ~~Có Postgres thật (local hoặc Docker) → chạy `prisma migrate deploy`~~ **XONG 2026-09-29**: `docker compose up -d postgres` + `prisma migrate deploy` áp dụng migration `20260929000000_init` thành công lên Postgres thật; `docs/DATABASE.md` đã cập nhật 6 bảng PLANNED → IMPLEMENTED.
2. Viết + chạy integration test thật (backend, chạm DB) và Supertest cho tầng HTTP. (Đã verify thủ công qua Postman/newman ở mục "API documentation" nhưng đó không thay thế test tự động trong CI.)
3. Chạy 2 server thật (backend + frontend) nối với nhau, xác nhận luồng thật: register/login set cookie đúng, CSRF round-trip đúng. (Đã verify riêng phần backend qua Postman/newman; chưa verify cùng frontend thật.)
4. RISK-A03 (kế thừa, chưa mitigate): manual smoke test với bot Telegram thật (BotFather) + webhook HTTPS công khai — thuộc QA gate, không phải backend/frontend-agent.
5. Quyết định `npm audit` fix trước hay sau production.

## Cập nhật 2026-09-29: refactor sang common component layer
User yêu cầu thêm design-agent vào workflow (xem AGENTS.md/workflows/feature-development.md/agents/design/SYSTEM.md) và dọn frontend vì các form (`LoginForm`, `RegisterForm`, `AccountLinkPanel`) lặp lại input/button/error-message thô, không có shared layer, CSS vẫn là boilerplate mặc định của Vite.

Đã thêm `frontend/src/components/common/` (`TextField`, `Button`, `InlineAlert`, `InlineStatus`) và style tương ứng trong `index.css` (`.field`, `.btn`/`.btn-primary`/`.btn-secondary`, `.inline-message*`, `.tabs`/`.tab`). Áp dụng vào toàn bộ 5 component hiện có (`LoginForm`, `RegisterForm`, `AccountLinkPanel`, `LogoutButton`, `TelegramLoginButton`) và `App.tsx`. Không đổi DOM semantics (label association, `role="alert"`/`role="status"`, accessible name của button) nên không sửa test nào.

**Bằng chứng (verify lại, không chỉ tin báo cáo)**:
```
cd frontend && npm test -- --run
Test Files  3 passed (3)
Tests       8 passed (8)

npm run build
✓ built in 108ms   (tsc -b + vite build, không lỗi)

npm run lint
1 warning (react/set-state-in-effect trong AccountLinkPanel.tsx, đã tồn tại từ trước refactor này, không liên quan thay đổi)
```

**Ghi nhận (BLOCKER-DESIGN-001 trong decision.json)**: gate `design_status` mới thêm chưa áp dụng hồi tố cho UI đã implement trước đó của chính feature này — `design/user-authentication.md` chưa tồn tại. Coordinator cần quyết định retro-design hay legacy exception trước khi feature vào CODE_REVIEW.

## Handoff cho CODE_REVIEW
Chưa đề xuất chuyển CODE_REVIEW — cần hoàn tất mục "Việc còn lại" ở trên trước (đặc biệt mục 1-3, cần môi trường có Postgres). Reviewer (độc lập, không phải backend/frontend-agent đã implement) sẽ cần: source diff, kết quả test (unit + integration khi có), migration đã áp dụng, và đối chiếu lại từng AC trong architecture doc.
