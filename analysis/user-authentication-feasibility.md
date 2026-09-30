# BA feasibility: user-authentication

Requirement revision: r4-2026-09-30 (sha256:124bbe4476ad90aacc6741e35a60f19afc64ace61382dc012d61c102b26045e6) | Owner: ba-feasibility-agent
Decision: features/user-authentication/decision.json
Status: APPROVED_WITH_CONDITIONS

Thay đổi so với lần feasibility trước (dựa trên requirement r1): user đổi cơ chế Telegram từ Login Widget (HMAC verify trên payload client gửi) sang bot deep-link (`/start <code>`). BA verify lại toàn bộ phần Telegram bằng tài liệu chính thức mới; phần password/session/CSRF/rate-limit giữ nguyên kết luận cũ (đã verify, không có thay đổi).

Thay đổi so với lần feasibility trước dựa trên r2 (nay r4, 2026-09-30): user đổi cơ chế bot nhận `/start <code>` từ webhook sang long-polling `getUpdates` (webhook không hoạt động được ở local dev, không có domain HTTPS công khai). BA verify `getUpdates` bằng tài liệu chính thức mới (EV-012). RISK-A03 (cần domain HTTPS công khai để smoke test) **RESOLVED** — long-polling không cần hạ tầng đó ở bất kỳ môi trường nào. COND-A05 (webhook secret token) **SUPERSEDED** — không còn endpoint nhận request từ bên ngoài cho luồng Telegram nên không còn gì để verify header; tuyến phòng thủ duy nhất còn lại là bảo vệ `TELEGRAM_BOT_TOKEN` (đã có ở BR-013).

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
| EV-012 | `getUpdates`: long polling, tham số `offset` (phải lớn hơn `update_id` cao nhất đã nhận 1 đơn vị — coi như "ack"), `limit` (1-100, default 100), `timeout` (giây, default 0 = short polling). **"This method will not work if an outgoing webhook is set up"** — phải `deleteWebhook` trước nếu trước đó đã `setWebhook`. Phải tự tính lại `offset` sau mỗi response để tránh nhận lại update đã xử lý. | Telegram Bot API official reference, method "getUpdates", https://core.telegram.org/bots/api#getupdates | 2026-09-30 | N/A | Tài liệu chính thức Telegram Bot API | VERIFIED |

## Financial feasibility
Không áp dụng — feature không có bất kỳ phép tính tài chính, unit tiền tệ, hay liability nào.

## Provenance analysis
Không áp dụng trực tiếp, áp dụng tinh thần "provenance" cho **identity provenance** (không đổi so với lần feasibility trước): 1 User ↔ tối đa 1 local credential, tối đa 1 Telegram identity; BR-002/003/004 (không auto-merge, từ chối nếu identity đã thuộc user khác) enforce bằng unique constraint DB + transaction — feasible, không có rào cản kỹ thuật mới từ việc đổi cơ chế Telegram.

## API/security/operational feasibility
- **Password hashing / session / CSRF / rate limiting**: kết luận không đổi so với lần feasibility trước — khả thi đầy đủ với `argon2` (EV-001/002), `express-session` + Postgres-backed store (EV-003/004), `csrf-sync` (EV-006a, không dùng `csurf` EV-005), `@nestjs/throttler` (EV-007).
- **Telegram bot deep-link login**: khả thi đầy đủ.
  - Sinh `code` bí mật dùng 1 lần (đề xuất: 256-bit random, encode base64url để nằm trong ràng buộc 64 ký tự của EV-008) làm `payload` deep-link.
  - Bot nhận `/start <code>` qua long-polling `getUpdates` (EV-012, đổi từ webhook theo r4); `message.from` (EV-009) là nguồn dữ liệu định danh đáng tin — không cần HMAC verify vì đây không phải dữ liệu client-supplied.
  - Không còn header cần verify (không có endpoint nào nhận request từ bên ngoài cho luồng này nữa) — tuyến phòng thủ chuyển hoàn toàn sang bảo vệ bí mật `TELEGRAM_BOT_TOKEN` (BR-013): ai giữ token đó có thể tự gọi `getUpdates` (và Telegram chỉ phục vụ 1 long-poll client tại 1 thời điểm — client giả mạo sẽ cướp update hoặc gây lỗi conflict cho polling loop thật).
  - `code` phải hết hạn sau thời gian ngắn và không dùng lại được sau khi đã khớp (single-use) — kỹ thuật thuần, feasible bằng state machine + DB record, xem architecture.
  - Chống hijack: `code` nên gắn với phiên trình duyệt đã sinh ra nó (session id của request tạo `code`), để một bên thứ ba biết được `code` (rò rỉ log, chụp màn hình...) không tự poll/claim được kết quả bằng trình duyệt khác — feasible bằng cách so khớp session id lúc claim.
  - **Lựa chọn thư viện bot**: không bắt buộc dùng framework bot đầy đủ (`telegraf`) vì nhu cầu của feature này rất hẹp — chỉ vài lời gọi Bot API (`deleteWebhook` lúc khởi động, vòng lặp `getUpdates`, `sendMessage` để phản hồi user). Gọi thẳng Bot API qua HTTPS (`fetch` built-in của Node.js) là đủ, tránh thêm dependency có lệch pha release (EV-011) cho một bề mặt dùng rất nhỏ — khớp nguyên tắc ưu tiên giải pháp tối thiểu. Đây là đề xuất kỹ thuật cho architect, không phải quyết định cuối; nếu sau này cần bot phức tạp hơn (nhiều command, conversation state) thì xem lại.
  - **Giới hạn cố ý đơn giản hoá**: long-polling giả định đúng 1 instance backend gọi `getUpdates` tại 1 thời điểm (nhiều instance cùng poll sẽ tranh nhau update, Telegram không chia sẻ update cho nhiều long-poll client). Chấp nhận được ở MVP (single instance); nếu scale ngang sau này cần quay lại webhook hoặc dùng 1 instance riêng chuyên polling rồi phân phối nội bộ — ghi nhận là upgrade path, không phải thiếu sót.
- **Secret management**: session secret và `TELEGRAM_BOT_TOKEN` qua biến môi trường không commit / secret manager — không có rào cản mới. `TELEGRAM_WEBHOOK_SECRET_TOKEN`/`TELEGRAM_WEBHOOK_URL` không còn cần thiết (loại bỏ khỏi env, xem architecture).
- **Test environment**: password flow test nội bộ hoàn toàn (unit/integration DB test). Bot flow test bằng cách giả lập 1 batch `Update[]` trả về từ `getUpdates` (JSON cố định theo cấu trúc `Message`/`User` của EV-009), đưa thẳng vào hàm xử lý update dùng chung — không cần gọi Telegram thật để test happy-path/expired-code/reused-code/duplicate-update-sau-restart. Cần 1 lần manual smoke test với bot Telegram thật (đã đăng ký qua BotFather) trước khi DONE để xác nhận hành vi thực tế khớp tài liệu — **không còn cần domain/webhook công khai** để làm việc này (RISK-A03 resolved).

## AC coverage và missing cases
- AC-001..AC-004 (local register/login/rate-limit): feasible đầy đủ, evidence EV-001/002/007 (không đổi).
- AC-005, AC-005b, AC-005c, AC-006 (Telegram bot login + expiry/reuse/hijack protection): feasible đầy đủ, evidence EV-008/009/010. Kiến trúc cần chốt: thời hạn `code` cụ thể (kỹ thuật, không phải OPEN_QUESTION nghiệp vụ, tương tự lý do trước đây dùng cho `auth_date`), và cơ chế polling/claim phía frontend.
- AC-007, AC-008 (link account 2 chiều): feasible bằng transaction + unique constraint (không đổi); luồng Telegram trong AC-007 nay dùng cùng cơ chế `code` (gắn thêm `linkingUserId` vào bản ghi `code` khi tạo trong lúc đã có session).
- AC-009 (logout), AC-010 (CSRF reject), AC-011 (req.user.id không giả mạo được): không đổi so với lần feasibility trước, feasible.
- Missing case theo cơ chế mới (r4): **update redelivery sau restart backend** (long-polling chưa kịp ack `offset` trước khi crash/restart, `getUpdates` có thể trả lại cùng update) — xử lý bằng đúng cơ chế idempotent `UPDATE ... WHERE status='PENDING'` đã có sẵn (không cần dedup mới), architecture cần ghi rõ; **code reuse/race** (2 client cùng thử claim 1 `code` đã CONFIRMED) — cùng dạng với race link-account, xử lý bằng transaction/state machine ở DB. Case "webhook giả mạo" của lần feasibility trước không còn áp dụng (không còn endpoint nhận request từ bên ngoài).

## Decision
**APPROVED_WITH_CONDITIONS.**

Conditions (due tại ARCHITECTURE):
- COND-A01: Chọn thư viện CSRF cụ thể (đề xuất `csrf-sync`, EV-006a) — không dùng `csurf` (EV-005). *(giữ nguyên từ lần trước, không đổi)*
- COND-A02: Chọn session store production-grade thay MemoryStore, cơ chế logout = xoá session record. *(giữ nguyên)*
- COND-A03: Chốt tham số Argon2id cụ thể dùng baseline OWASP làm điểm khởi đầu. *(giữ nguyên)*
- COND-A04: Thiết kế schema với `email verification` nullable, không chặn cấu trúc dù OQ-A05 chưa chốt. *(giữ nguyên)*
- COND-A05: **SUPERSEDED** (r4, 2026-09-30) — không còn webhook endpoint nào cần verify header. Thay bằng: bảo vệ bí mật `TELEGRAM_BOT_TOKEN` qua secret manager/env, không hardcode (đã có ở BR-013, không cần condition riêng mới).
- COND-A06 (mới): Thiết kế `code` deep-link: entropy đủ cao (đề xuất ≥128-bit), single-use, có hạn, gắn với session đã sinh ra nó để chống bên thứ ba biết `code` claim hộ (AC-005c).
- COND-A12 (mới, r4): Thiết kế polling loop `getUpdates` phải `deleteWebhook` trước khi bắt đầu poll (EV-012: "will not work if an outgoing webhook is set up"), tự tính lại `offset` sau mỗi response, và tái sử dụng đúng state machine idempotent hiện có (`UPDATE ... WHERE status='PENDING'`) để an toàn khi update bị gửi lại sau restart.

Risks:
- RISK-A01: **RESOLVED/KHÔNG CÒN ÁP DỤNG** — đã loại bỏ nhờ đổi sang bot deep-link, không còn phụ thuộc Telegram Login Widget cổ điển đã bị archive.
- RISK-A02 (giữ nguyên, kế thừa từ requirement OQ-A09): Không có "quên mật khẩu" trong MVP — user mất local credential mà chưa link Telegram sẽ mất quyền truy cập vĩnh viễn qua local login. Cần user accept hoặc mở rộng scope.
- RISK-A03: **RESOLVED** (r4, 2026-09-30) — long-polling không cần domain/webhook HTTPS công khai ở bất kỳ môi trường nào (dev lẫn prod), loại bỏ hoàn toàn dependency vận hành từng chặn manual smoke test.

Open questions không do BA quyết: OQ-A05..A09 (như cũ) + OQ-A10 (ai sở hữu/tạo bot, quản lý token) — không chặn ARCHITECTURE (schema/API đủ tổng quát), PHẢI chốt trước DONE hoặc trước khi vận hành thật.

Không finding nào bị bỏ qua do "critical unknown" — mọi behavior cốt lõi (hash, session, CSRF, deep-linking, webhook secret) đã có evidence chính thức đủ để architect thiết kế.
