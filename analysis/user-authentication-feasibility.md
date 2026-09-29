# BA feasibility: user-authentication

Requirement revision: r2-2026-09-29 (sha256:0852040727a2f7145bf8462c40fe0b2bc61eaff5c10ffdf8f9dfbb003d8dccfa) | Owner: ba-feasibility-agent
Decision: features/user-authentication/decision.json
Status: APPROVED_WITH_CONDITIONS

Thay đổi so với lần feasibility trước (dựa trên requirement r1): user đổi cơ chế Telegram từ Login Widget (HMAC verify trên payload client gửi) sang bot deep-link (`/start <code>`). BA verify lại toàn bộ phần Telegram bằng tài liệu chính thức mới; phần password/session/CSRF/rate-limit giữ nguyên kết luận cũ (đã verify, không có thay đổi).

## Scope và assumption challenge
Requirement giữ đúng 2 phương thức đăng nhập đã chốt bởi user (email+password, Telegram qua bot) và invariant "không auto-merge identity". BA không tìm thấy lý do kỹ thuật để mở rộng sang OAuth/SSO/2FA khác — giữ nguyên scope.

Điểm tích cực phát hiện khi đổi sang bot deep-link: cơ chế này **loại bỏ hoàn toàn RISK-A01** của lần feasibility trước (Telegram Login Widget cổ điển bị tài liệu chính thức đánh dấu archived, ưu tiên luồng OIDC mới). Với bot deep-link, dữ liệu định danh Telegram user (`id, first_name, username...`) đến trực tiếp từ Telegram Bot API (server-to-server, xác thực bằng bot token của chính app) qua webhook — không phải payload do trình duyệt/client chuyển tiếp, nên không cần verify chữ ký HMAC trên dữ liệu đó. Rủi ro bảo mật chuyển sang một hướng khác: (a) đảm bảo webhook endpoint chỉ nhận update thật từ Telegram (không phải bên thứ ba giả mạo POST tới cùng URL), và (b) đảm bảo `code` dùng trong `/start <code>` là bí mật dùng 1 lần, có hạn, và gắn đúng với trình duyệt đã sinh ra nó — cả hai đều feasible kỹ thuật, xem Evidence/Decision.

Các quyết định nghiệp vụ (OQ-A05..A09: email verification, session duration, rate-limit threshold, password policy, forgot-password) và OQ-A10 (ai sở hữu bot/bot token, vận hành) KHÔNG thuộc phạm vi BA xác minh kỹ thuật — giữ nguyên OPEN_QUESTION, không tự chọn.

## Evidence register
| ID | Claim / exact API behavior | Official URL + section | Checked at | Account scope | Evidence / limitations | Status |
|---|---|---|---|---|---|---|
| EV-001 | OWASP khuyến nghị Argon2id là lựa chọn hàng đầu cho password hashing (min ~19 MiB memory, iteration 2, parallelism 1; cấu hình mạnh hơn cho production: ~128 MiB, 3-5 iterations). bcrypt là fallback chấp nhận được (cost ≥ 12) nếu không dùng được Argon2, giới hạn: password bị cắt ở 72 byte, không memory-hard. | OWASP Cheat Sheet Series — Password Storage Cheat Sheet, section "Argon2id"/"Bcrypt", https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html | 2026-09-29 | N/A (framework-agnostic) | Cheat sheet chính thức OWASP | VERIFIED |
| EV-002 | Package `argon2` (npm, repo `ranisalt/node-argon2`) là binding Node.js cho Argon2 reference implementation, mặc định hash bằng Argon2id, có TypeScript types kèm sẵn, đang được maintain (hỗ trợ Node ≥22). | npm package `argon2`, https://www.npmjs.com/package/argon2 | 2026-09-29 | N/A | Dùng trực tiếp qua service, không cần wrapper NestJS riêng | VERIFIED |
| EV-003 | NestJS docs chính thức khuyến nghị `express-session` cho adapter Express. Cảnh báo MemoryStore mặc định "not designed for production... leaks memory... does not scale past a single process". | NestJS docs, "Techniques → Session", https://docs.nestjs.com/techniques/session | 2026-09-29 | N/A | Tài liệu chính thức NestJS | VERIFIED |
| EV-004 | `express-session` cookie option: `httpOnly` mặc định `true`; `secure: true` chỉ gửi qua HTTPS (cần `trust proxy` sau reverse proxy); `sameSite` nhận `'strict'\|'lax'\|'none'`. | expressjs/session official docs, https://expressjs.com/en/resources/middleware/session/ | 2026-09-29 | N/A | Tài liệu chính thức Express | VERIFIED |
| EV-005 | `csurf` đã bị archive (2022-09-14), Express.js chính thức xác nhận deprecation do không đủ resource maintain lỗ hổng bảo mật. KHÔNG dùng cho code mới. | GitHub `expressjs/csurf` (archived) + `expressjs/discussions#155` | 2026-09-29 | N/A | Nguồn chính thức Express org | VERIFIED |
| EV-006a | `csrf-sync` implement Synchronizer Token Pattern, yêu cầu session middleware (khớp thiết kế cookie-session), lưu token trong `request.session`. | npm `csrf-sync`, https://www.npmjs.com/package/csrf-sync | 2026-09-29 | N/A | Hậu duệ cộng đồng của `csurf`, maintenance vừa phải | VERIFIED |
| EV-006b | `csrf-csrf` implement Double Submit Cookie (stateless) — 154k tải/tuần nhưng không release >12 tháng (Snyk "Inactive"), ít khớp thiết kế session-based hơn. | npm `csrf-csrf`; Snyk Advisor | 2026-09-29 | N/A | Đối chiếu, không phải lựa chọn chính | VERIFIED |
| EV-007 | `@nestjs/throttler` là package rate-limiting chính thức NestJS org, hỗ trợ Express, định danh theo IP mặc định, maintain tích cực. | npm `@nestjs/throttler` + https://docs.nestjs.com/security/rate-limiting | 2026-09-29 | N/A | Tài liệu + package chính thức | VERIFIED |
| EV-008 | Telegram deep linking: URL `https://t.me/<bot_username>?start=<payload>`. `payload` chỉ chứa `A-Z a-z 0-9 _ -`, tối đa 64 ký tự (khuyến nghị base64url nếu cần encode dữ liệu phức tạp). Khi user mở link và bấm Start trong chat riêng với bot, bot nhận tin nhắn văn bản `/start <payload>`. | Telegram official docs, "Bot features → Deep linking", https://core.telegram.org/bots/features#deep-linking | 2026-09-29 | N/A | Tài liệu chính thức Telegram, không mô tả chi tiết toàn bộ Update object nhưng xác nhận cơ chế `/start <payload>` | VERIFIED |
| EV-009 | Update dạng `message` mà bot nhận qua Bot API (`getUpdates`/webhook) có field `message.from` chứa `id` (số, định danh Telegram user), `is_bot`, `first_name`, `last_name?`, `username?`, `language_code?` — dữ liệu này do chính server Telegram điền vào, không phải do client gửi lên app, nên không cần verify chữ ký như payload widget. | Telegram Bot API official reference, object "User"/"Message", https://core.telegram.org/bots/api#user , https://core.telegram.org/bots/api#message | 2026-09-29 | N/A | Tài liệu chính thức Telegram Bot API | VERIFIED |
| EV-010 | `setWebhook` yêu cầu URL HTTPS; tham số tuỳ chọn `secret_token` (1-256 ký tự `A-Z a-z 0-9 _ -`) khiến Telegram đính kèm header `X-Telegram-Bot-Api-Secret-Token` đúng giá trị đó trong MỌI request gửi update tới webhook. App phải so khớp header này trước khi xử lý update, để xác nhận request thật sự đến từ Telegram (chặn bên thứ ba giả mạo POST trực tiếp tới URL webhook). | Telegram Bot API official reference, method "setWebhook", https://core.telegram.org/bots/api#setwebhook | 2026-09-29 | N/A | Tài liệu chính thức Telegram Bot API | VERIFIED |
| EV-011 | Framework Node.js phổ biến nhất cho Telegram bot (`telegraf`) có hoạt động GitHub gần đây (tính đến 2026-09-24) nhưng bản publish gần nhất trên npm (4.16.3) đã ~3 năm — lệch pha giữa GitHub và npm registry. | npm `telegraf`; GitHub `telegraf/telegraf` | 2026-09-29 | N/A | Không phải lý do loại bỏ, nhưng là dữ liệu để architect cân nhắc chi phí thêm dependency so với gọi thẳng Bot API (xem Decision) | VERIFIED |

## Financial feasibility
Không áp dụng — feature không có bất kỳ phép tính tài chính, unit tiền tệ, hay liability nào.

## Provenance analysis
Không áp dụng trực tiếp, áp dụng tinh thần "provenance" cho **identity provenance** (không đổi so với lần feasibility trước): 1 User ↔ tối đa 1 local credential, tối đa 1 Telegram identity; BR-002/003/004 (không auto-merge, từ chối nếu identity đã thuộc user khác) enforce bằng unique constraint DB + transaction — feasible, không có rào cản kỹ thuật mới từ việc đổi cơ chế Telegram.

## API/security/operational feasibility
- **Password hashing / session / CSRF / rate limiting**: kết luận không đổi so với lần feasibility trước — khả thi đầy đủ với `argon2` (EV-001/002), `express-session` + Postgres-backed store (EV-003/004), `csrf-sync` (EV-006a, không dùng `csurf` EV-005), `@nestjs/throttler` (EV-007).
- **Telegram bot deep-link login**: khả thi đầy đủ.
  - Sinh `code` bí mật dùng 1 lần (đề xuất: 256-bit random, encode base64url để nằm trong ràng buộc 64 ký tự của EV-008) làm `payload` deep-link.
  - Bot nhận `/start <code>` qua webhook; `message.from` (EV-009) là nguồn dữ liệu định danh đáng tin — không cần HMAC verify vì đây không phải dữ liệu client-supplied.
  - Webhook endpoint phải verify header `X-Telegram-Bot-Api-Secret-Token` (EV-010) trước khi xử lý bất kỳ update nào — đây là tuyến phòng thủ thay thế cho việc "verify chữ ký payload" của cách cũ.
  - `code` phải hết hạn sau thời gian ngắn và không dùng lại được sau khi đã khớp (single-use) — kỹ thuật thuần, feasible bằng state machine + DB record, xem architecture.
  - Chống hijack: `code` nên gắn với phiên trình duyệt đã sinh ra nó (session id của request tạo `code`), để một bên thứ ba biết được `code` (rò rỉ log, chụp màn hình...) không tự poll/claim được kết quả bằng trình duyệt khác — feasible bằng cách so khớp session id lúc claim.
  - **Lựa chọn thư viện bot**: không bắt buộc dùng framework bot đầy đủ (`telegraf`) vì nhu cầu của feature này rất hẹp — chỉ 2 lời gọi Bot API (`setWebhook` lúc khởi động, `sendMessage` để phản hồi user) và nhận 1 loại update (`/start <code>`). Gọi thẳng Bot API qua HTTPS (`fetch` built-in của Node.js) là đủ, tránh thêm dependency có lệch pha release (EV-011) cho một bề mặt dùng rất nhỏ — khớp nguyên tắc ưu tiên giải pháp tối thiểu. Đây là đề xuất kỹ thuật cho architect, không phải quyết định cuối; nếu sau này cần bot phức tạp hơn (nhiều command, conversation state) thì xem lại.
- **Secret management**: session secret, `TELEGRAM_BOT_TOKEN`, và `TELEGRAM_WEBHOOK_SECRET_TOKEN` qua biến môi trường không commit / secret manager — không có rào cản mới.
- **Test environment**: password flow test nội bộ hoàn toàn (unit/integration DB test). Bot flow test bằng cách giả lập webhook payload (JSON cố định theo cấu trúc `Message`/`User` của EV-009) gửi tới endpoint nội bộ kèm đúng `secret_token` — không cần gọi Telegram thật để test happy-path/expired-code/reused-code/wrong-secret-token. Cần 1 lần manual smoke test với bot Telegram thật (đã đăng ký qua BotFather, domain/webhook thật) trước khi DONE để xác nhận hành vi thực tế khớp tài liệu.

## AC coverage và missing cases
- AC-001..AC-004 (local register/login/rate-limit): feasible đầy đủ, evidence EV-001/002/007 (không đổi).
- AC-005, AC-005b, AC-005c, AC-006 (Telegram bot login + expiry/reuse/hijack protection): feasible đầy đủ, evidence EV-008/009/010. Kiến trúc cần chốt: thời hạn `code` cụ thể (kỹ thuật, không phải OPEN_QUESTION nghiệp vụ, tương tự lý do trước đây dùng cho `auth_date`), và cơ chế polling/claim phía frontend.
- AC-007, AC-008 (link account 2 chiều): feasible bằng transaction + unique constraint (không đổi); luồng Telegram trong AC-007 nay dùng cùng cơ chế `code` (gắn thêm `linkingUserId` vào bản ghi `code` khi tạo trong lúc đã có session).
- AC-009 (logout), AC-010 (CSRF reject), AC-011 (req.user.id không giả mạo được): không đổi so với lần feasibility trước, feasible.
- Missing case bổ sung theo cơ chế mới: **webhook giả mạo** (bên thứ ba POST trực tiếp tới URL webhook không qua Telegram) — đã có AC cần bổ sung ở architecture (kiểm tra `secret_token`), không có trong AC gốc của requirement nhưng là hệ quả bắt buộc của BR-009 mới; **code reuse/race** (2 client cùng thử claim 1 `code` đã CONFIRMED) — cùng dạng với race link-account, xử lý bằng transaction/state machine ở DB.

## Decision
**APPROVED_WITH_CONDITIONS.**

Conditions (due tại ARCHITECTURE):
- COND-A01: Chọn thư viện CSRF cụ thể (đề xuất `csrf-sync`, EV-006a) — không dùng `csurf` (EV-005). *(giữ nguyên từ lần trước, không đổi)*
- COND-A02: Chọn session store production-grade thay MemoryStore, cơ chế logout = xoá session record. *(giữ nguyên)*
- COND-A03: Chốt tham số Argon2id cụ thể dùng baseline OWASP làm điểm khởi đầu. *(giữ nguyên)*
- COND-A04: Thiết kế schema với `email verification` nullable, không chặn cấu trúc dù OQ-A05 chưa chốt. *(giữ nguyên)*
- COND-A05 (mới): Thiết kế webhook endpoint nhận update Telegram PHẢI verify header `X-Telegram-Bot-Api-Secret-Token` (EV-010) trước khi xử lý, và bot token/secret token phải qua secret manager/env, không hardcode.
- COND-A06 (mới): Thiết kế `code` deep-link: entropy đủ cao (đề xuất ≥128-bit), single-use, có hạn, gắn với session đã sinh ra nó để chống bên thứ ba biết `code` claim hộ (AC-005c).

Risks:
- RISK-A01: **RESOLVED/KHÔNG CÒN ÁP DỤNG** — đã loại bỏ nhờ đổi sang bot deep-link, không còn phụ thuộc Telegram Login Widget cổ điển đã bị archive.
- RISK-A02 (giữ nguyên, kế thừa từ requirement OQ-A09): Không có "quên mật khẩu" trong MVP — user mất local credential mà chưa link Telegram sẽ mất quyền truy cập vĩnh viễn qua local login. Cần user accept hoặc mở rộng scope.
- RISK-A03 (mới): Bot Telegram cần được tạo và vận hành thật (BotFather, webhook URL công khai HTTPS) trước khi có thể chạy end-to-end — đây là dependency vận hành/triển khai (OQ-A10), không phải rủi ro thiết kế, nhưng chặn manual smoke test nếu chưa có bot thật.

Open questions không do BA quyết: OQ-A05..A09 (như cũ) + OQ-A10 (ai sở hữu/tạo bot, quản lý token) — không chặn ARCHITECTURE (schema/API đủ tổng quát), PHẢI chốt trước DONE hoặc trước khi vận hành thật.

Không finding nào bị bỏ qua do "critical unknown" — mọi behavior cốt lõi (hash, session, CSRF, deep-linking, webhook secret) đã có evidence chính thức đủ để architect thiết kế.
