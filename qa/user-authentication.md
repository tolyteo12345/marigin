# QA: user-authentication

Owner: coordinator (qa-agent role) | Reviewed revision: sha256:fe390b492771e01c703b28012949a14cb21365b21177f9bb2d703aba3b1bbf9d (`features/user-authentication/implementation.md`, review APPROVED tại `features/user-authentication/review.md` sha256:4aeee54e96ad7f60403c865c3de52978725ea9835e96d0f075e18c12a021a175)
Requirement r4: sha256:124bbe4476ad90aacc6741e35a60f19afc64ace61382dc012d61c102b26045e6 | Architecture: sha256:d9f767aba0da91da047f38aabcdf51393ec8bade05aa6be14e31233e7ed3fd90
Decision: features/user-authentication/decision.json

## Phạm vi và môi trường
Test qua Postgres thật (Docker, `margin_trading_test`, tách khỏi DB dev) + mocked Prisma cho unit test — không giao dịch/nghiệp vụ LIVE nào áp dụng (feature này không chạm tài chính/Binance). Backend dist rebuild lại trước khi test bằng `npx nest build`.

## Bằng chứng đã tự chạy lại (không chỉ tin review.md)
```
npx tsc -b --noEmit && npx nest build          # sạch
npm test                                        # 5 suites / 38 tests pass (mocked Prisma)
DATABASE_URL=...margin_trading_test npm run test:e2e   # 1 suite / 8 tests pass (Postgres thật)
cd ../frontend && npm test -- --run             # 4 files / 12 tests pass
cd ../frontend && npx tsc -b && npm run build   # sạch
```

**QA bổ sung 2 test case mới vào `backend/test/auth.e2e-spec.ts`** (thực thi boundary + concurrency/abuse test theo đúng trách nhiệm qa-agent, không chỉ tái xác nhận test cũ):
1. `rejects a 7-character password and accepts exactly 8 characters (BR-015 boundary)` — test boundary đúng ngưỡng `MinLength(8)`: 7 ký tự → 400, 8 ký tự → 200. Trước đó chỉ có validation qua class-validator, chưa có test boundary tường minh cho DTO này.
2. `locks the account after 5 failed attempts (BR-010/AC-004)` — 5 lần login sai liên tiếp cùng account, sau đó thử lần 6 với **đúng password** vẫn bị 401 với **cùng message chung** như các lần sai (chứng minh account đã khoá, không tiết lộ trạng thái khoá qua message khác biệt). Đây là test đầu tiên xác nhận `lockedUntil`/`failedLoginCount` hoạt động thật qua Postgres, trước đó chỉ có unit test cho state machine `isLocked` với input giả lập.

Phát hiện & sửa trong lúc viết test #2: `await setup.post(...).set('x-csrf-token', await getCsrfToken(setup))` (await lồng trực tiếp trong `.set()`) gây `ECONNREFUSED` không rõ ràng (superagent state hazard khi 1 request thứ hai được mở trên cùng agent trong lúc request đầu đang được construct chưa gửi) — đổi thành resolve token ra biến riêng trước, khớp pattern đã dùng ở mọi chỗ khác trong file. Không phải bug ứng dụng, là lỗi viết test; ghi lại để lần sau không lặp lại.

## Đối chiếu Acceptance Criteria
| AC | Trạng thái | Bằng chứng |
|---|---|---|
| AC-001 | PASS | e2e: register tạo User+LocalCredential, argon2id hash (unit: `hash.startsWith('$argon2id$')`, verify đúng/sai) |
| AC-002 | PASS | e2e: duplicate email → 409, account gốc không đổi |
| AC-003 | PASS | e2e: cookie `sid` `HttpOnly`/`SameSite=Lax` (xác nhận qua curl thật port 5173 + set-cookie header); `req.user.id` đúng qua `/me` |
| AC-004 | PASS | e2e mới: lockout sau 5 lần sai, message chung không đổi kể cả khi thử lại bằng password đúng lúc đang khoá; message giống hệt giữa "sai password" và "email không tồn tại" |
| AC-005, AC-005b | **NOT_RUN (cần user)** | Xem mục "Việc còn lại — bắt buộc trước DONE" bên dưới |
| AC-005c | PASS | Unit test `rejects a claim attempted from a different session than the initiator` |
| AC-006 | PASS | Code review xác nhận nhánh LOGIN luôn tạo User mới khi chưa có TelegramIdentity, không tìm-theo-email; unit test `creates a new User + TelegramIdentity when telegramUserId is unseen` |
| AC-007 | PASS | Unit test LINK: reject khi telegramUserId đã thuộc user khác + race qua P2002 |
| AC-008 | PASS | Unit test mới (`account-link.service.spec.ts`, viết trong CODE_REVIEW): reject đúng lý do cho cả email-taken và user-already-has-credential, kể cả 2 biến thể race |
| AC-009 | PASS | e2e: sau logout, `/me` → 401; `PrismaSessionStore.destroy` xoá row thật trong Postgres |
| AC-010 | PASS | e2e: thiếu CSRF token → 403 |
| AC-011 | PASS | e2e: 2 session độc lập không lẫn `userId`; code review xác nhận không route nào đọc `userId` từ body/param |

## Boundary / concurrency / API-failure — riêng ngoài AC
- **Boundary password (BR-015)**: PASS (test mới, xem trên).
- **Concurrency Telegram claim (LOGIN + LINK)**: PASS ở mức unit test (mock Prisma, cả 2 nhánh race đều có test sau CODE_REVIEW fix). **Chưa có test concurrency thật chạm Postgres** (`Promise.all` 2 claim thật) — khuyến nghị architecture đã ghi (`architecture/user-authentication.md` dòng 223) nhưng chưa thực thi bằng DB thật, chỉ bằng mock. Đánh giá: chấp nhận được cho MVP vì unique constraint là DB-level, logic ứng dụng chỉ cần đúng theo mock; rủi ro residual thấp, không chặn PASS.
- **API-failure Telegram Bot API** (timeout/lỗi mạng khi `getUpdates`/`sendMessage`): `pollLoop` có catch + backoff 5s (đọc code xác nhận), nhưng **không có test tự động nào** cho path này (private method, không expose qua public API để test không refactor). NOT_RUN, ghi nhận là gap đã biết (kế thừa từ implementation, không phải lỗi mới).
- **Rate-limit theo IP** (`ThrottlerGuard`, 10 req/phút): xác nhận có hoạt động thật (quan sát trực tiếp 429 sau request thứ 11 khi CHƯA patch guard trong lúc debug e2e ở CODE_REVIEW) — hành vi đúng thiết kế, chỉ tắt trong phạm vi test suite vì lý do test-isolation, không phải vì guard không hoạt động.

## Việc còn lại — bắt buộc trước DONE (không chặn PASS/PASS_WITH_WARNINGS, nhưng chặn DONE)
1. **RISM-A03 mitigation — manual smoke test với bot Telegram thật**: cần một người dùng thật (dev/QA có tài khoản Telegram) thực hiện luồng end-to-end: mở deep link `https://t.me/<bot>?start=<code>` sinh từ `POST /api/auth/telegram/start` của server đang chạy thật, bấm Start, xác nhận `GET /api/auth/telegram/status/:code` chuyển `PENDING → CONFIRMED → CLAIMED` đúng, và `req.user.id` sau đó khớp đúng Telegram user vừa xác nhận. **QA-agent (tôi) không có Telegram client để đóng vai người dùng gửi `/start <code>` — không thể tự thực hiện bước này, không giả lập kết quả.** Cần user tự chạy theo README (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_BOT_USERNAME` đã có trong `.env`) và báo lại evidence (screenshot hoặc log audit `TELEGRAM_LOGIN_CLAIMED`) để coordinator ghi bổ sung vào tài liệu này trước khi chuyển DONE.
2. **WARN-A01 (npm audit residual risk)**: coordinator đã đề xuất chấp nhận ở CODE_REVIEW, `accepted_by` vẫn `null` trong decision.json — cần user xác nhận rõ ràng trước DONE (theo AGENTS.md, không tự ý ghi user đã duyệt).

## Kết luận
Toàn bộ test tự động (unit + e2e thật + frontend) pass, không phát hiện vi phạm invariant bảo mật/session/CSRF/ownership nào mới ngoài 2 finding đã fix ở CODE_REVIEW. Không có test nào FAIL, không có correctness/security issue nào che giấu dưới warning.

**Đề xuất qa_status: PASS_WITH_WARNINGS** — warning duy nhất ảnh hưởng tới DONE (không ảnh hưởng correctness/security của phần đã test được) là mục 1 (manual Telegram smoke test) và mục 2 (npm audit acceptance) ở trên, cả hai đều cần **user tự xác nhận/thực hiện**, không phải điều qa-agent có thể tự chạy hoặc tự chấp nhận thay user.
