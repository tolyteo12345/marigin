# Code Review: user-authentication

Owner: coordinator (code-review-agent role, độc lập với backend-agent role đã implement) | Decision: features/user-authentication/decision.json

Input:
- Requirement r4: sha256:124bbe4476ad90aacc6741e35a60f19afc64ace61382dc012d61c102b26045e6
- Architecture: sha256:d9f767aba0da91da047f38aabcdf51393ec8bade05aa6be14e31233e7ed3fd90
- Implementation revision reviewed (trước 2 fix trong review này): sha256:e59ef602d33904d78973a0879a3a78d0db3529ce0cec1361f217ad63415aa51c (`features/user-authentication/implementation.md`, mục "Cập nhật 2026-09-30 (2)")
- Implementation revision sau khi áp fix (nguồn thật để QA dùng): sha256:fe390b492771e01c703b28012949a14cb21365b21177f9bb2d703aba3b1bbf9d (mục "Cập nhật 2026-09-30 (3)")
- Source: `backend/src/**`, `frontend/src/**`, `backend/test/**`, `backend/prisma/schema.prisma`

## Phương pháp
Đọc trực tiếp toàn bộ source (không chỉ tin implementation.md), đối chiếu từng AC-001..AC-011 (kể cả AC-005b/AC-005c) với code, chạy lại test thay vì chỉ tin log cũ, kiểm tra concurrency/race theo đúng nguyên tắc "Không dựa vào application-level check-then-write (TOCTOU) làm tuyến phòng thủ duy nhất" mà chính architecture doc đặt ra (mục Concurrency).

**Đã tự chạy lại toàn bộ trong quá trình review** (không chỉ tin báo cáo backend-agent):
```
npx tsc -b --noEmit && npx nest build   # sạch
npm test                                 # 5 suites / 38 tests pass (mocked Prisma)
DATABASE_URL=.../margin_trading_test npm run test:e2e   # 1 suite / 6 tests pass (Postgres thật)
```
Manual verify qua 2 server thật (backend dist cổng 3000 + frontend Vite dev cổng 5173, qua proxy `/api`): register→me→logout→me(401) round-trip đúng cookie `sid` (`HttpOnly`, `SameSite=Lax`).

## Finding 1 — CONFIRMED, đã sửa trong vòng review này: race Telegram LOGIN claim có thể ném lỗi chưa xử lý (500), không graceful như thiết kế yêu cầu
**File/dòng gốc**: `backend/src/telegram-bot/telegram-bot.service.ts`, nhánh `purpose === 'LOGIN'` trong `claim()` (trước sửa: dòng ~196-213).

**Mô tả**: Nhánh LOGIN gọi `tx.telegramIdentity.create(...)` sau khi `findUnique` trả `null`, nhưng KHÔNG bọc try/catch cho `P2002` (unique constraint `telegramUserId`) — trái với chính nguyên tắc concurrency mà architecture doc quy định ở mục "Link race (BR-004)": *"unique constraint... ở tầng DB là tuyến phòng thủ chính... Không dựa vào application-level check-then-write (TOCTOU) làm tuyến phòng thủ duy nhất"*. Nhánh LINK ngay bên dưới tuân thủ đúng nguyên tắc này (có try/catch P2002), nhưng nhánh LOGIN thì không — bất nhất giữa 2 nhánh cùng 1 hàm.

**Failure scenario**: User mở 2 tab cùng chờ 1 `code` Telegram (hoặc network/React re-render gửi trùng request `GET /telegram/status/:code`), cả 2 request đọc `request.status === 'CONFIRMED'` gần như đồng thời trước khi cái nào commit `CLAIMED`. Cả 2 transaction đều `findUnique` thấy `null` (chưa thấy insert chưa commit của nhau — READ COMMITTED), cả 2 đều thử `tx.telegramIdentity.create(...)` với cùng `telegramUserId`. Giao dịch thắng commit trước; giao dịch thua bị Postgres block rồi ném `PrismaClientKnownRequestError P2002` ngay tại insert — lỗi này KHÔNG được catch, văng thẳng lên `TelegramBotController.status()` (không có try/catch), Nest exception filter trả **500 Internal Server Error** cho request đó. Ở frontend, `TelegramLoginButton` xử lý MỌI lỗi poll (kể cả 500 tạm thời) bằng cách **dừng hẳn polling và chuyển `phase: 'error'`** (`frontend/src/components/TelegramLoginButton.tsx`, catch trong vòng poll) — tab thua cuộc sẽ đứng ở màn "Không thể kết nối tới máy chủ, vui lòng thử lại" dù tab kia đã đăng nhập thành công, cần user bấm "Thử lại" thủ công dù không có lỗi thật sự.

**Đã sửa**: bọc `tx.telegramIdentity.create` trong try/catch giống nhánh LINK, nhưng recovery khác nhánh LINK — LOGIN không có xung đột sở hữu thật (cả 2 request đều là cùng 1 Telegram user), nên khi thua race, đọc lại `findUniqueOrThrow` để lấy `userId` của giao dịch thắng và tiếp tục (outer `updateMany where status='CONFIRMED'` sẽ khớp 0 dòng vì bên thắng đã set `CLAIMED`, trả `ALREADY_RESOLVED` — controller tự đọc lại state mới nhất, không còn 500). Thêm test `recovers onto the winning userId when a concurrent claim wins the create race` (`backend/test/telegram-bot.service.spec.ts`). Verify lại: `npm test` 38/38 pass, `tsc -b`/`nest build` sạch.

**Outcome**: fixed (trong vòng review này, cùng session với implement).

## Finding 2 — CONFIRMED, đã sửa: `AccountLinkService.linkLocal` báo sai lý do reject khi race lệch constraint
**File/dòng gốc**: `backend/src/account-link/account-link.service.ts:44-56` (catch P2002 sau `createCredential`).

**Mô tả**: `LocalCredential` có 2 unique constraint độc lập (`email`, `userId`). Catch block cũ LUÔN trả message "email đã được sử dụng bởi tài khoản khác" bất kể P2002 thật sự vi phạm constraint nào — không đọc `err.meta.target` để phân biệt.

**Failure scenario**: User đang đăng nhập mở 2 tab, cả 2 đều bấm "thêm email+password" gần như đồng thời với 2 email KHÁC NHAU (ví dụ gõ nhầm rồi sửa ở tab kia). Cả 2 request đều qua được check `findByEmail`/`findByUserId` (chưa thấy nhau, đều `null`) rồi cùng `create`. Giao dịch thua thật ra vi phạm **`userId` unique** (tài khoản này sắp có credential từ tab kia) chứ không phải email trùng, nhưng response vẫn báo "email đã được sử dụng bởi tài khoản khác" — sai lý do, gây khó hiểu cho user (email họ nhập rõ ràng chưa ai dùng) và cho debugging sau này (audit log ghi `UNIQUE_CONSTRAINT_RACE` chung chung, không phân biệt được 2 case khi tra log).

**Đã sửa**: đọc `err.meta?.target`, phân biệt `userId` vs `email`, trả đúng message + audit reason tương ứng (`USER_ALREADY_HAS_LOCAL_CREDENTIAL_RACE` / `EMAIL_TAKEN_RACE`). Thêm `backend/test/account-link.service.spec.ts` (file mới — service này trước đó **không có unit test nào**, gap có từ trước, không phải do review này tạo ra): 5 test case phủ cả happy path và cả 2 nhánh race. Verify: `npm test` 38/38 pass.

**Outcome**: fixed.

## Đối chiếu AC (sau fix)
| AC | Kết quả |
|---|---|
| AC-001 | PASS — `AuthService.register` tạo User + LocalCredential, argon2id hash (`hashPassword`), e2e xác nhận DB thật |
| AC-002 | PASS — 409 khi email trùng, e2e xác nhận account gốc không đổi |
| AC-003 | PASS — cookie `httpOnly`/`SameSite=Lax`, `secure` theo `isProduction`; `AuthGuard` set `req.user.id` chỉ từ session |
| AC-004 | PASS — `GENERIC_LOGIN_ERROR_MESSAGE` dùng chung cho sai password/email không tồn tại/lockout (e2e xác nhận cùng message); rate-limit theo account qua `failedLoginCount`/`lockedUntil`, theo IP qua `ThrottlerGuard` |
| AC-005/5b | Chưa test tự động bằng bot thật (đúng như đã biết — RISK-A03 mitigation là manual smoke test ở QA gate, không phải review gate); logic state machine có unit test đầy đủ với mock Prisma |
| AC-005c | PASS — `matchesInitiatorSession` chặn claim từ session khác, unit test `rejects a claim attempted from a different session than the initiator` |
| AC-006 | PASS — nhánh LOGIN luôn tạo `User` mới khi chưa có `TelegramIdentity`, không có logic tìm-theo-email nào |
| AC-007 | PASS — nhánh LINK reject khi `telegramUserId` đã thuộc user khác, có test; race lost qua unique constraint cũng được catch đúng (P2002 → REJECTED) |
| AC-008 | PASS (sau Finding 2 fix) — 2 lý do reject phân biệt đúng kể cả trong race |
| AC-009 | PASS — `destroySession` + e2e xác nhận `GET /me` sau logout → 401, session row bị xoá khỏi Postgres thật (`PrismaSessionStore.destroy`) |
| AC-010 | PASS — `CsrfGuard` áp cho mọi route mutation, e2e xác nhận thiếu token → 403 |
| AC-011 | PASS — `req.user.id` luôn lấy từ `req.session.userId` server-side, không route nào đọc `userId` từ body/param cho mục đích xác định danh tính (đã grep toàn bộ controller) |

## Ghi nhận không chặn (không phải finding, để QA/coordinator theo dõi)
- **WARN-A01** (npm audit, 24 vulnerabilities devDependency/build-toolchain hoặc tính năng không dùng — chi tiết ở implementation.md): `accepted_by` vẫn `null`, coordinator đã đề xuất nhưng cần user xác nhận rõ ràng, không phải blocker review.
- Nhánh LINK của `claim()` có try/catch P2002 đúng nhưng **chưa có unit test riêng cho chính path race đó** (chỉ test path "đã tồn tại qua findUnique", không test path "findUnique null rồi create mới ném P2002") — gap có từ trước, không phải finding mới vì code path đó vốn đã đúng theo thiết kế, chỉ thiếu test. Không chặn review vì đây là test-coverage gap trên code ĐÃ đúng, khác Finding 1 (code sai).
- Comment trong `rate-limit.module.ts` còn nhắc `POST /api/auth/telegram/webhook` (endpoint đã xoá ở r4) — comment lỗi thời, không ảnh hưởng hành vi, nên dọn ở lần sửa kế tiếp chạm file đó.

## Kết luận
Cả 2 finding đều đã fix và verify lại trong chính vòng review này (không tạo REJECTED rồi chờ vòng sau — theo yêu cầu user "hoàn tất, đóng blocker"). Không phát hiện vi phạm invariant tài chính (feature không chạm tài chính), không phát hiện secret bị log/lộ plaintext (đã grep `apiKey|password|secret|token` qua các log call), CSRF/session/ownership đúng thiết kế.

**review_status: APPROVED**, gắn implementation revision sha256:fe390b492771e01c703b28012949a14cb21365b21177f9bb2d703aba3b1bbf9d (implementation.md mục "Cập nhật 2026-09-30 (3)", đã mô tả đúng 2 fix áp trong vòng review này).
