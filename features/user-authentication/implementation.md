# Implementation: user-authentication

Owner: coordinator (tổng hợp từ backend-agent + frontend-agent) | Architecture revision: sha256:d9f767aba0da91da047f38aabcdf51393ec8bade05aa6be14e31233e7ed3fd90
Requirement revision: r4 sha256:124bbe4476ad90aacc6741e35a60f19afc64ace61382dc012d61c102b26045e6
Decision: features/user-authentication/decision.json

## Cập nhật 2026-09-30 (5): bugfix — ThrottlerGuard áp nhầm toàn bộ route thay vì chỉ 3 endpoint
User báo lỗi thật từ console trình duyệt: `GET /api/auth/me 429 (Too Many Requests)` chỉ sau vài lần tải trang. Nguyên nhân xác nhận qua code: `rate-limit.module.ts` đăng ký `ThrottlerGuard` làm `APP_GUARD` **toàn cục**, áp dụng cho MỌI route trong app — trong khi `architecture/user-authentication.md` mục "Rate limit" chỉ định rõ giới hạn 10 req/phút/IP chỉ áp cho đúng 3 endpoint: `POST /auth/login`, `POST /auth/register`, `POST /auth/telegram/start`. Global guard khiến `GET /auth/me` (gọi từ cả `App.tsx` lẫn `AccountLinkPanel.tsx`, nhân đôi bởi React StrictMode ở dev) và `GET /auth/telegram/status/:code` (poll mỗi ~2s) dùng chung 1 ngân sách 10 request/phút với login/register — sai với chính comment trong code cũ (comment ghi "per architecture doc" nhưng thực thi sai phạm vi).

Sửa: bỏ đăng ký `APP_GUARD` toàn cục trong `RateLimitModule` (chỉ giữ `ThrottlerModule.forRoot(...)` config, export ra ngoài), áp `@UseGuards(ThrottlerGuard, CsrfGuard)` trực tiếp lên đúng 3 method: `AuthController.register`, `AuthController.login`, `TelegramBotController.start`. Endpoint khác (me, csrf-token, logout, telegram/status, link/local, toàn bộ binance-connections) mặc định KHÔNG bị throttle — an toàn hơn về thiết kế vì endpoint mới thêm sau này sẽ mặc định không bị dính lỗi tương tự, phải khai báo rõ mới bị giới hạn.

Test mới: `backend/test/rate-limit.e2e-spec.ts` (file mới, KHÔNG mock `ThrottlerGuard` như các e2e khác — cố tình dùng guard thật để verify đúng bug đã báo cáo): (1) 15 lần gọi `GET /auth/me` liên tiếp đều 401, không có lần nào 429 (tái hiện đúng bug rồi xác nhận đã hết). (2) tương tự cho `GET /auth/csrf-token`. (3) `POST /auth/login` sai password lặp lại vẫn bị 429 sau ngưỡng — xác nhận rate-limit vẫn hoạt động đúng chỗ cần. Verify lại toàn bộ: `npm test` 69/69, `npm run test:e2e` 19/19 (từ 16, +3 test rate-limit), Postman/newman collection auth (13/13) và binance-connections (13/13) đều pass sau khi restart backend thật.

## Cập nhật 2026-09-30 (4): bugfix — mất trạng thái đăng nhập khi reload trang
User báo lỗi thật khi dùng app: reload trang bị đưa về màn đăng nhập dù session cookie vẫn còn hiệu lực phía server. Nguyên nhân: `frontend/src/App.tsx` dùng `isLoggedIn` là React state cục bộ khởi tạo cứng `false`, KHÔNG bao giờ gọi `GET /api/auth/me` để kiểm tra session đã tồn tại lúc mount — vi phạm ngầm AC-003 (session hợp lệ phải tiếp tục hoạt động cho các request sau, không riêng request đăng nhập). Đây là gap có từ lần implement gốc, không phải regression của binance-read-only-connection.

Sửa: `App.tsx` gọi `me()` 1 lần trong `useEffect` khi mount, hiển thị "Đang tải..." trong lúc chờ, set `isLoggedIn=true` nếu `me()` thành công (200) hoặc `false` nếu lỗi (401 = chưa đăng nhập). Đây cũng giải thích luôn 1 báo cáo thứ hai của user ("đã liên kết Telegram nhưng bấm vào vẫn hỏi liên kết") — nhiều khả năng do reload khiến UI hiển thị nhầm màn đăng nhập trong khi session/liên kết Telegram thực ra vẫn còn nguyên, user bấm lại nút Telegram ở màn đăng nhập (nhầm ngữ cảnh) thay vì thấy đúng `AccountLinkPanel` đã liên kết — chưa có cách nào tự xác nhận lại giả thuyết này (cần user thử lại sau fix và báo lại nếu vẫn còn lặp).

Test mới: `frontend/src/App.test.tsx` (file trước đó chưa tồn tại) — "renders the logged-in dashboard directly when a valid session already exists" + "renders the login screen when there is no valid session". Verify lại: `npx tsc -b`, `npm run build`, `npm test -- --run` → 6 files/20 tests pass (từ 18), `npm run lint` không phát sinh warning mới.

## Cập nhật 2026-09-30 (3): 2 fix từ CODE_REVIEW (features/user-authentication/review.md, Finding 1 + 2)
Reviewer độc lập phát hiện 2 lỗi trong chính vòng review, đã fix ngay trong vòng review đó (không tách vòng REJECTED riêng, theo yêu cầu user đóng dứt điểm blocker):
- `backend/src/telegram-bot/telegram-bot.service.ts`, nhánh `claim()` `purpose === 'LOGIN'`: bọc try/catch P2002 quanh `tx.telegramIdentity.create` (trước đó chỉ nhánh LINK có, LOGIN không có — bất nhất, có thể ném 500 chưa xử lý khi 2 tab poll trùng 1 code CONFIRMED). Khi thua race, đọc lại `findUniqueOrThrow` lấy `userId` của giao dịch thắng thay vì throw. Test mới: `backend/test/telegram-bot.service.spec.ts` — `recovers onto the winning userId when a concurrent claim wins the create race`.
- `backend/src/account-link/account-link.service.ts`, catch P2002 sau `createCredential`: đọc `err.meta.target` để phân biệt race trên constraint `email` vs `userId`, trả đúng message/audit reason cho từng case (trước đó luôn báo "email đã được sử dụng" kể cả khi race thật ra là `userId`). Test mới (file trước đó chưa tồn tại): `backend/test/account-link.service.spec.ts`.

Verify lại toàn bộ sau 2 fix: `npx tsc -b --noEmit` + `npx nest build` sạch; `npm test` 5 suites/38 tests pass (tăng từ 32 vì 2 test mới + 4 test AccountLinkService khác); `npm run test:e2e` (Postgres thật) 6/6 pass không đổi. Chi tiết root-cause/failure-scenario đầy đủ ở `review.md`, không lặp lại ở đây.

## Cập nhật 2026-09-30: đổi cơ chế Telegram từ webhook sang long-polling
User phát hiện webhook không hoạt động được ở local dev (`ERR_CONNECTION_REFUSED`/không nhận update — Telegram không gửi được webhook về `localhost`) và yêu cầu đổi sang long-polling `getUpdates` để không cần domain HTTPS công khai ở bất kỳ môi trường nào. Đã chạy lại đầy đủ chuỗi REQUIREMENT (r4) → BA_FEASIBILITY (EV-012 mới) → ARCHITECTURE (READY) trước khi sửa code, theo Invalidation rule của `workflows/feature-development.md` (BR-009 chốt cứng "webhook" nên đổi cơ chế là thay đổi nội dung requirement, không chỉ chi tiết architecture).

Thay đổi code (`backend/src/telegram-bot/`):
- `telegram-bot.service.ts`: `TelegramBotService` implement `OnModuleInit`/`OnModuleDestroy`. `onModuleInit` gọi `deleteWebhook()` rồi khởi động vòng lặp `pollLoop()` nền gọi `getUpdates({ offset, timeout: 30, allowed_updates: ['message'] })`; `offset` giữ in-memory, tự tính lại `= max(update_id) + 1` sau mỗi batch (EV-012). `handleUpdate()` gộp logic parse `/start <code>` + `confirmFromUpdate` (đổi tên từ `confirmFromWebhook`) + `sendMessage` + ghi `AuthAuditLog TELEGRAM_LOGIN_CONFIRMED` — trước đây nằm ở controller, nay chuyển vào service vì không còn là 1 HTTP request nữa. Bỏ `verifyWebhookSecret`/`setWebhook`, thêm `deleteWebhook`. `TelegramBotService` cần inject thêm `AuditService`.
- `telegram-bot.controller.ts`: xoá hẳn endpoint `POST /api/auth/telegram/webhook` (không còn ai gọi vào backend cho luồng Telegram nữa). `start`/`status` giữ nguyên logic.
- `main.ts`: bỏ lời gọi `setWebhook()` thủ công lúc bootstrap (chuyển vào `onModuleInit`), thêm `app.enableShutdownHooks()` để `onModuleDestroy` chạy đúng lúc SIGTERM, dừng vòng lặp polling.
- `auth-config.service.ts`: xoá 2 getter `telegramWebhookUrl`/`telegramWebhookSecretToken`. `.env`/`.env.example`: xoá `TELEGRAM_WEBHOOK_URL`/`TELEGRAM_WEBHOOK_SECRET_TOKEN`.
- `backend/postman/margin-trading-auth.postman_collection.json`: xoá request "Webhook" + variable `telegramWebhookSecret` (endpoint không còn tồn tại). Swagger tự động hết mô tả endpoint đó (không cần sửa gì thêm vì trước đó đã `@ApiExcludeEndpoint`).
- `backend/README.md`: cập nhật ghi chú chỉ cần `TELEGRAM_BOT_TOKEN`, không cần webhook URL/domain.

**Bằng chứng kiểm thử (đã tự chạy lại)**:
```
cd backend && npx tsc -b --noEmit   # sạch
cd backend && npx nest build        # sạch
cd backend && npx jest
Test Suites: 4 passed, 4 total
Tests:       32 passed, 32 total     # 35 - 3 test verifyWebhookSecret (method đã xoá) = 32
```
`telegram-bot.service.spec.ts` cập nhật: bỏ `describe('verifyWebhookSecret')`, đổi `confirmFromWebhook` → `confirmFromUpdate` trong test, mock thêm `AuditService`. Không có test tự động cho `pollLoop`/`getUpdates` thật (gọi network) — nhất quán với việc `setWebhook`/`sendMessage` cũ cũng chưa từng có test network thật, chỉ có thể verify qua manual smoke test với bot thật (RISK-A03).

Frontend không đổi (không chạm tới cơ chế nhận update phía server, `TelegramLoginButton`/`authClient.ts` vẫn gọi đúng `/telegram/start` + poll `/telegram/status/:code` như cũ).

RISK-A03 coi như RESOLVED cho phần thiết kế/vận hành (không cần domain/webhook công khai nữa); mục 4 "Việc còn lại" bên dưới cập nhật theo.

## Cập nhật 2026-09-30 (2): hoàn tất "Việc còn lại" mục 2, 3, 5 — đề xuất implementation_status READY
Coordinator (backend-agent role) đóng nốt 3 việc còn lại trước CODE_REVIEW, theo yêu cầu user "hoàn tất các việc còn thiếu trước khi review":

- **Mục 2 (integration test thật, Supertest + DB thật)**: thêm `backend/test/auth.e2e-spec.ts` + `backend/test/jest-e2e.json` + script `npm run test:e2e`. Chạy `Test.createTestingModule({ imports: [AppModule] })` (không mock Prisma) nối `margin_trading_test` — DB Postgres thật riêng biệt, tách khỏi `margin_trading` dev (tạo bằng `CREATE DATABASE margin_trading_test`, áp `prisma migrate deploy` cùng migration `20260929000000_init`). `TelegramBotService` bị `overrideProvider` bằng stub (`onModuleInit/onModuleDestroy` no-op) để không gọi Bot API thật lúc bootstrap test — logic claim/confirm Telegram đã có unit test riêng (mock Prisma) nên không mất coverage. `ThrottlerGuard.prototype.canActivate` bị `jest.spyOn(...).mockResolvedValue(true)` vì `TestingModuleBuilder.overrideProvider(APP_GUARD)` không chạm được provider APP_GUARD khai báo trong `RateLimitModule` (Nest bind theo token nội bộ riêng cho mỗi khai báo APP_GUARD, không phải chuỗi hằng số dùng chung) — đã verify bằng thực nghiệm (guard thật không được gọi khi override qua APP_GUARD, có gọi khi patch prototype); rate limit có hành vi thật (429 sau 10 req/phút) đã tự quan sát được khi CHƯA patch, chỉ tắt trong phạm vi suite này vì suite gọi nhiều hơn 10 req/phút từ 1 "IP" giữa các test case độc lập, không phải AC cần suite này verify.
  6 test case: round-trip register→me→logout→me(401); duplicate email 409 (không ảnh hưởng account gốc); login sai password và login email không tồn tại trả **cùng 1 message 401** (không leak account existence); thiếu CSRF token → 403; `link/local` không có session → 401; 2 session độc lập không thấy dữ liệu của nhau (IDOR-style).
  ```
  docker exec margin-trading-auth-postgres psql -U user -d margin_trading -c "CREATE DATABASE margin_trading_test"
  DATABASE_URL='postgresql://user:password@localhost:5432/margin_trading_test?schema=public' npx prisma migrate deploy
  DATABASE_URL='postgresql://user:password@localhost:5432/margin_trading_test?schema=public' npm run test:e2e
  Test Suites: 1 passed, 1 total
  Tests:       6 passed, 6 total
  ```
  Unit test cũ vẫn xanh sau khi thêm suite này: `npm test` → 4 suites / 32 tests pass; `npx tsc -b --noEmit` và `npx nest build` sạch.

- **Mục 3 (chạy backend+frontend thật nối nhau)**: cả 2 server thật đã chạy sẵn trong môi trường (`backend/dist/main` cổng 3000, `frontend` Vite dev cổng 5173, dist backend vừa rebuild lại bằng `npx nest build` ở bước trên nên khớp code hiện tại). Gọi thật qua cổng Vite (`http://localhost:5173/api/...`, đúng đường đi trình duyệt sẽ dùng — proxy `/api` giữ same-origin nên cookie hoạt động không cần CORS/SameSite=None) bằng `curl` giữ cookie jar: `csrf-token` (set cookie `sid`, `HttpOnly; SameSite=Lax`) → `register` (200) → `me` (200, đúng `userId`/`hasLocalCredential`/`localEmailMasked` đã mask) → lấy CSRF token mới → `logout` (200) → `me` (401). Xác nhận round-trip cookie/CSRF qua đúng proxy path hoạt động đúng như thiết kế, không chỉ đúng khi gọi thẳng backend.

- **Mục 5 (quyết định npm audit)**: `npm audit` sau khi thêm `supertest`/`@types/supertest` (devDependency, chỉ dùng trong test) báo 24 vulnerabilities (4 low/12 moderate/8 high). Đã chạy `npm audit fix` (không breaking) — không có gì để tự fix an toàn (qs vẫn kẹt vì ràng buộc lock transitive, không đổi được nếu không nâng luôn gói cha). Toàn bộ vulnerability còn lại (`js-yaml`/`lodash` qua `@nestjs/swagger`/`@nestjs/config`, `multer`/`qs`/`body-parser` qua `@nestjs/platform-express`, `picomatch`/`tmp`/`inquirer`/`webpack`/`glob`/`ajv` qua `@nestjs/cli`/schematics) nằm ở **devDependency/build-toolchain hoặc tính năng không dùng trong feature này** (`multer` là multipart file upload — app không có endpoint upload file nào). Fix an toàn nhất đòi `npm audit fix --force`, nâng `@nestjs/swagger`→12, `@nestjs/platform-express`→12, `@nestjs/cli`→12 — các bản này yêu cầu Nest 11 core (đã ghi nhận từ lúc chọn `@nestjs/swagger@^8` vì "yêu cầu Nest 11+"), tức là một cuộc nâng cấp Nest 10→11 phối hợp toàn bộ dependency, không phải "audit fix" đơn thuần và vượt phạm vi đóng blocker hiện tại.
  **Quyết định (residual risk, ghi rõ theo AGENTS.md thay vì âm thầm bỏ qua)**: chấp nhận 24 vulnerability này ở MVP vì không nằm trên runtime path xử lý request thật của feature (build tool hoặc tính năng không dùng), mitigation là nâng cấp Nest 10→11 (kèm audit lại toàn bộ breaking change của `@nestjs/*` v11/v12) như một task riêng có scope của chính nó, không lồng vào feature `user-authentication`. Owner: coordinator + user, cần quyết định lịch nâng cấp trước khi có endpoint mới rủi ro cao hơn (đặc biệt trước khi thêm bất kỳ endpoint nhận file upload nào chạm `multer`).

**Trạng thái tổng quan cập nhật**: implementation **READY** — cả 3 mục còn lại đã đóng bằng bằng chứng chạy thật (không chỉ dự định). Mục 4 (manual smoke test Telegram bot thật qua long-polling) giữ nguyên thuộc QA gate, không chặn CODE_REVIEW.

## API documentation (Swagger + Postman)
Theo yêu cầu user 2026-09-29 ("API đang không có document..."), đã bổ sung và cập nhật `AGENTS.md`/`workflows/feature-development.md` để bắt buộc mọi thay đổi API từ nay phải kèm Swagger + Postman:
- **Swagger**: cài `@nestjs/swagger@^8` (bản tương thích Nest 10, không dùng bản 11/12 vì yêu cầu Nest 11+). `main.ts` mount `SwaggerModule` tại `/api/docs` (JSON tại `/api/docs-json`) chỉ khi `NODE_ENV !== 'production'`. Thêm `@ApiTags/@ApiOperation/@ApiResponse/@ApiCookieAuth` cho toàn bộ 8 endpoint public và `@ApiProperty` cho `RegisterDto/LoginDto/LinkLocalDto`. Endpoint `POST /auth/telegram/webhook` dùng `@ApiExcludeEndpoint()` vì đây là Telegram Bot API gọi vào (không phải contract cho client của mình), không phải thiếu sót.
- **Postman**: `backend/postman/margin-trading-auth.postman_collection.json`, 3 folder (`auth`, `account-link`, `telegram`) khớp đúng 9 route thật (kể cả `webhook`, đưa vào để test thủ công dù exclude khỏi Swagger). Request POST cần CSRF có `prerequest` script tự gọi `GET /auth/csrf-token` lấy token mới ngay trước khi gửi (đúng hành vi thật: `login` gọi `regenerateSession` nên token cũ từ session trước sẽ bị 403 nếu tái dùng).
- **Bằng chứng đã tự chạy lại để xác minh** (Postgres thật qua `docker compose up -d postgres` + `prisma migrate deploy`, backend chạy thật bằng `npm run start`, verify bằng `newman run backend/postman/margin-trading-auth.postman_collection.json`): toàn bộ flow `csrf-token → register → login → me → logout`, `telegram/start → telegram/status/:code` (PENDING), `account-link/local` (401 đúng khi chưa đăng nhập) trả đúng status code như Swagger doc mô tả. `webhook` trả 401 khi thiếu secret header (đúng thiết kế, không test được CLAIMED thật vì cần bot Telegram thật — thuộc QA gate, xem mục "Việc còn lại" #4).
- Do cần chạy migration thật để verify Swagger response chính xác, đã tiện thể hoàn tất mục 1 của "Việc còn lại" bên dưới (xem `docs/DATABASE.md`, 6 bảng user-authentication đã IMPLEMENTED).

## Backend (`backend/`, NestJS + Prisma)
Cấu trúc module đúng theo architecture: `PrismaModule`, `AuthConfigModule`, `SessionStoreModule` (custom `PrismaSessionStore`), `CsrfModule` (csrf-sync), `RateLimitModule` (@nestjs/throttler), `LocalCredentialModule` (argon2id), `TelegramBotModule` (gọi thẳng Bot API qua `fetch`, không dùng bot framework), `AccountLinkModule`, `AuditModule`, `AuthModule`.

Toàn bộ 8 endpoint theo API contract đã implement (r4: bỏ `POST /api/auth/telegram/webhook`, thay bằng long-polling nội bộ, xem "Cập nhật 2026-09-30" ở trên): `GET /api/auth/csrf-token`, `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/telegram/start`, `GET /api/auth/telegram/status/:code`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/link/local`.

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
4. RISK-A03 (r4: không còn cần webhook HTTPS công khai): vẫn cần 1 lần manual smoke test với bot Telegram thật (BotFather, chỉ cần `TELEGRAM_BOT_TOKEN`) qua long-polling — thuộc QA gate, không phải backend/frontend-agent.
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
Đề xuất chuyển CODE_REVIEW — mục "Việc còn lại" 1-3, 5 đã đóng bằng bằng chứng chạy thật (xem "Cập nhật 2026-09-30 (2)"); mục 4 (manual smoke test Telegram bot thật) thuộc QA gate, không chặn review. Reviewer (độc lập, không phải backend/frontend-agent đã implement) cần: source diff, kết quả test (unit 32/32 + e2e 6/6 chạm DB thật), migration đã áp dụng lên Postgres thật, đối chiếu lại từng AC trong architecture doc (đặc biệt AC-005c session-hijack binding, AC-010 CSRF, lockout BR-010, absolute session cap BR-011), và quyết định residual risk npm audit đã ghi ở trên.
