# Requirement: user-authentication

Revision: r3-2026-09-29 | Owner: product-requirement-agent | Decision: features/user-authentication/decision.json

Thay đổi so với r1: user yêu cầu đổi cơ chế đăng nhập Telegram từ Telegram Login Widget (nhúng iframe, verify HMAC trên payload client gửi lên) sang luồng bot deep-link: user bấm nút mở Telegram, chat với bot riêng của platform, gõ/bấm `/start <code>`, bot nhận update trực tiếp từ Telegram Bot API rồi khớp `code` với phiên đăng nhập đang chờ trên trình duyệt. Phần đăng nhập/đăng ký local password và luồng liên kết tài khoản giữ nguyên không đổi.

Thay đổi so với r2: user chốt toàn bộ chính sách nghiệp vụ còn OPEN_QUESTION (2026-09-29): OQ-A05 (không bắt buộc email verification ở MVP), OQ-A06 (session rolling 7 ngày, tuyệt đối 30 ngày), OQ-A07 (rate-limit 5 lần sai/15 phút, khoá 15 phút), OQ-A08 (password tối thiểu 8 ký tự, không ép ký tự đặc biệt — NIST 800-63B), OQ-A09 (không có forgot-password ở MVP, RISK-A02 được user chấp nhận). BR-010/011/014/015 cập nhật từ OPEN_QUESTION thành Verified (business decision).

## Problem, user và outcome
Toàn bộ platform là hosted, multi-user. Feature `binance-read-only-connection` (architecture/binance-read-only-connection.md, BLOCKER-ARCH-001) đã thiết kế xong nhưng giả định có sẵn một `req.user.id` đáng tin cậy per-request, cookie session, và CSRF token cho state-changing request — giả định này chưa có bất kỳ implementation nào trong repo. Mọi module downstream khác trong docs/DOMAIN.md (Margin Dashboard, Borrow Position Manager, Capital Provenance Ledger...) cũng cần per-user ownership scoping. `user-authentication` là prerequisite bắt buộc, phải qua đầy đủ workflow trước khi bất kỳ backend-agent nào implement feature phụ thuộc.

Đây không phải feature nghiệp vụ trading — không tính toán tài chính, không chạm Binance. Đây là nền tảng identity/session cho toàn platform.

Outcome đo được:
- User đăng nhập được bằng 1 trong 2 phương thức: (1) email + password, (2) Telegram qua bot riêng của platform (bấm nút → mở Telegram → `/start <code>` → quay lại trình duyệt đã đăng nhập).
- Sau đăng nhập, mọi request tới backend có `req.user.id` lấy từ session đáng tin cậy (không nhận từ client body/param), dùng được ngay cho ownership check của feature khác (ví dụ `BinanceConnection.userId`).
- User đăng xuất được; session bị vô hiệu hoá thực sự (không chỉ xoá cookie phía client).
- Nếu một user đang đăng nhập bằng 1 phương thức, họ có thể chủ động "liên kết" thêm phương thức còn lại vào cùng account — chỉ qua thao tác thủ công, không bao giờ tự động.
- Không có cách nào 2 identity (local email/password và Telegram) bị gộp vào cùng 1 user mà không qua xác nhận chủ động của chính user đang sở hữu cả hai phiên đăng nhập đó.

## Scope / MVP / non-goals

In-scope (MVP):
- Đăng ký + đăng nhập bằng email + password.
- Tạo và vận hành 1 Telegram bot riêng của platform (đăng ký qua BotFather) để phục vụ đăng nhập/liên kết: user bấm nút "Đăng nhập bằng Telegram" trên web → mở deep link `https://t.me/<bot>?start=<code>` → user bấm "Start" trên Telegram (gửi `/start <code>` tới bot) → bot (chạy trong backend) nhận update qua Telegram Bot API, khớp `code` với phiên đang chờ trên trình duyệt → trình duyệt tự phát hiện hoàn tất và có session. Không dùng Telegram Login Widget (iframe/HMAC payload từ client) nữa.
- Session cookie (httpOnly, secure, sameSite) làm cơ chế xác thực per-request cho cả 2 luồng — không dùng JWT trong Authorization header cho luồng browser chính (tránh cần thêm cơ chế lưu token phía client và giữ nhất quán với yêu cầu CSRF-protected cookie session của `binance-read-only-connection`).
- CSRF token bắt buộc cho mọi request thay đổi state (login, logout, register, link-account, và mọi POST/PUT/DELETE của feature khác dùng chung session).
- Đăng xuất (logout) — vô hiệu hoá session phía server.
- Thao tác "liên kết tài khoản" thủ công 2 chiều: (a) đang đăng nhập bằng local password → liên kết thêm Telegram; (b) đang đăng nhập bằng Telegram → thêm email+password vào cùng account.
- Rate-limit chống brute-force cho luồng đăng nhập bằng password.
- Audit log cho các sự kiện auth quan trọng (đăng ký, đăng nhập thành công/thất bại, logout, link account) — redacted, không log password/token.

Out-of-scope (không tự thêm ngoài yêu cầu):
- OAuth provider khác (Google, Facebook...), SSO, 2FA/MFA — KHÔNG được yêu cầu, không tự thêm.
- Quên mật khẩu / reset password qua email — **xác nhận KHÔNG có trong MVP** (quyết định 2026-09-29, BR-016). User mất local credential chưa link Telegram sẽ mất quyền truy cập vĩnh viễn qua đường local; rủi ro này (RISK-A02) đã được user chấp nhận.
- Quản lý danh sách phiên đăng nhập đa thiết bị / "đăng xuất khỏi mọi thiết bị khác" — không được yêu cầu, không tự thêm (chỉ cần logout phiên hiện tại).
- Phân quyền/role (admin, v.v.) — không được yêu cầu.
- Bất kỳ tính toán tài chính, Binance call, hay ledger nào — thuộc feature khác.

Dependencies: `binance-read-only-connection` (đã ARCHITECTURE READY, BLOCKED tại IMPLEMENTATION chờ feature này) là consumer đầu tiên của contract `req.user.id`/session/CSRF do feature này định nghĩa. `docs/DATABASE.md` cần bảng `User` trước khi `BinanceConnection.userId` có FK cụ thể.

## User stories
- US-001: Là user mới, tôi muốn đăng ký tài khoản bằng email + password để có thể đăng nhập sau này.
- US-002: Là user đã có tài khoản, tôi muốn đăng nhập bằng email + password.
- US-003: Là user, tôi muốn đăng nhập bằng tài khoản Telegram của mình (bấm nút, xác nhận trên Telegram qua bot của platform) mà không cần tạo password, để đăng nhập nhanh.
- US-004: Là user đã đăng nhập bằng 1 phương thức, tôi muốn chủ động liên kết thêm phương thức đăng nhập còn lại vào cùng tài khoản, để dùng phương thức nào cũng vào cùng 1 account.
- US-005: Là user, tôi muốn đăng xuất và biết chắc phiên đăng nhập của tôi bị vô hiệu hoá ngay, không ai dùng lại được session cũ.
- US-006: Là user, tôi muốn hệ thống chặn brute-force nếu ai đó cố đoán password của tôi.
- US-007: Là developer của feature khác (vd. `binance-read-only-connection`), tôi cần `req.user.id` đáng tin cậy và CSRF token hợp lệ để implement ownership-scoped endpoint mà không phải tự xây auth riêng.
- US-008 (an toàn): Là user, tôi không muốn tài khoản của tôi bị người khác chiếm quyền bằng cách đăng ký email trùng ngẫu nhiên với email tôi dùng cho Telegram, hoặc ngược lại — hệ thống không được tự động gộp 2 identity.

## Business rules
| ID | Rule + units | Source | Verification / question |
|---|---|---|---|
| BR-001 | Hỗ trợ đúng 2 phương thức đăng nhập: email+password và Telegram qua bot riêng của platform (deep-link `/start <code>`). Không tự thêm OAuth/SSO/2FA khác. | Quyết định nghiệp vụ user (đã chốt trước đó, sửa đổi 2026-09-29: đổi từ Telegram Login Widget sang bot deep-link) | Verified (business decision) |
| BR-002 | Mỗi phương thức đăng nhập mặc định tạo/khớp vào 1 identity riêng (local credential hoặc Telegram identity). Không có cơ chế tự động hợp nhất 2 identity theo email trùng hoặc bất kỳ heuristic nào. | Quyết định nghiệp vụ user (đã chốt trước đó) | Verified (business decision, invariant bảo mật) |
| BR-003 | Liên kết 2 identity vào cùng 1 user CHỈ xảy ra khi: user đang có session hợp lệ bằng phương thức A, chủ động chọn "liên kết" phương thức B, và hoàn tất xác thực phương thức B ngay trong luồng đó (nhập đúng password hiện tại, hoặc hoàn tất `/start <code>` với bot Telegram cho đúng phiên đang liên kết) trong phiên đăng nhập của A. | Quyết định nghiệp vụ user (đã chốt trước đó) | Verified (business decision, chống account takeover) |
| BR-004 | Nếu phương thức B (đang được liên kết) đã thuộc về một user khác, hệ thống PHẢI từ chối liên kết với lỗi rõ ràng, không được tự ý chuyển identity đó sang user đang thao tác. | Hệ quả trực tiếp của BR-002/BR-003 | Verified (invariant bảo mật) |
| BR-005 | `req.user.id` chỉ được set từ session đã xác thực phía server (cookie session), không bao giờ nhận trực tiếp từ client body/param/header cho mục đích xác định danh tính. | AGENTS.md, yêu cầu downstream của `binance-read-only-connection` | Verified (nguyên tắc bảo mật cơ bản) |
| BR-006 | Mọi request POST/PUT/DELETE liên quan tới session (login, logout, register, link-account) và mọi mutation endpoint của feature dùng chung session phải kiểm tra CSRF token phía server. | AGENTS.md, architecture/binance-read-only-connection.md | Verified (nguyên tắc bảo mật cơ bản); cơ chế/thư viện cụ thể → BA xác minh |
| BR-007 | Password không bao giờ lưu plaintext, không log ở bất kỳ level nào (kể cả log lỗi/stack trace). | AGENTS.md | Verified (nguyên tắc bắt buộc) |
| BR-008 | Thuật toán hash password cụ thể (bcrypt/argon2, cost/parameter) phải theo khuyến nghị hiện hành từ tài liệu chính thức (không dùng trí nhớ). | AGENTS.md | NEEDS_VERIFICATION (BA) |
| BR-009 | Đăng nhập/liên kết Telegram thực hiện qua bot riêng của platform: hệ thống sinh 1 `code` dùng 1 lần, gắn với phiên trình duyệt đang khởi tạo (chống người khác dùng lại `code` dù có biết); user mở deep link `https://t.me/<bot>?start=<code>` và bấm Start; bot nhận `/start <code>` qua Telegram Bot API (webhook), lấy thông tin Telegram user trực tiếp từ update (Telegram server gửi, không phải client-side payload) rồi khớp với `code` đang chờ. `code` phải có thời hạn ngắn và không dùng lại được sau khi đã khớp. | Yêu cầu bảo mật của user (sửa đổi 2026-09-29), core.telegram.org | NEEDS_VERIFICATION (BA: cơ chế deep-link + webhook chính xác theo tài liệu Telegram Bot API, cách xác thực webhook đến từ Telegram thật) |
| BR-010 | Rate-limit chống brute-force cho đăng nhập password: tối đa **5 lần thử sai / 15 phút** theo account; vượt ngưỡng → khoá **15 phút** (`lockedUntil`). Kết hợp rate-limit theo IP ở tầng middleware (xem architecture). | Quyết định nghiệp vụ user (chốt 2026-09-29) | Verified (business decision) |
| BR-011 | Session có thời hạn: **rolling 7 ngày** (mỗi request active gia hạn thêm), **tuyệt đối tối đa 30 ngày** kể từ lúc login dù vẫn hoạt động liên tục → bắt buộc đăng nhập lại. | Quyết định nghiệp vụ user (chốt 2026-09-29) | Verified (business decision) |
| BR-012 | Logout phải vô hiệu hoá session phía server (xoá/huỷ session record), không chỉ xoá cookie ở client. | Bảo mật session chuẩn | Verified (nguyên tắc bắt buộc) |
| BR-013 | Secret dùng để ký/mã hoá session (session secret) và Telegram bot token không được hardcode trong code hoặc commit; phải qua secret manager/biến môi trường không commit. | AGENTS.md | Verified (nguyên tắc bắt buộc); cơ chế cụ thể theo môi trường deploy → BA/architecture |
| BR-014 | KHÔNG bắt buộc xác thực email (email verification) ở MVP — user đăng ký xong login được ngay. Không có luồng gửi mail verify trong scope này. | Quyết định nghiệp vụ user (chốt 2026-09-29) | Verified (business decision) |
| BR-015 | Chính sách password: tối thiểu **8 ký tự**, không ép buộc ký tự hoa/số/đặc biệt (theo khuyến nghị hiện hành NIST 800-63B — độ dài quan trọng hơn ký tự phức tạp bắt buộc). | Quyết định nghiệp vụ user (chốt 2026-09-29), NIST 800-63B | Verified (business decision) |
| BR-016 | KHÔNG có luồng "quên mật khẩu" (reset qua email) ở MVP. User mất local credential (quên password) mà chưa link Telegram sẽ mất quyền truy cập vĩnh viễn qua đường local — user đã xác nhận chấp nhận rủi ro này (RISK-A02 accepted). | Quyết định nghiệp vụ user (chốt 2026-09-29) | Verified (business decision, residual risk accepted) |

## Acceptance criteria
| ID | Given / When / Then | Rule | Expected evidence |
|---|---|---|---|
| AC-001 | Given user chưa có tài khoản, When đăng ký với email + password hợp lệ, Then tạo `User` mới + 1 local credential, password được hash (không plaintext) | BR-001, BR-007, BR-008 | Test: sau đăng ký, DB không chứa plaintext password; hash verify đúng |
| AC-002 | Given email đã tồn tại trong local credential, When đăng ký lại với email đó, Then từ chối rõ ràng, không tạo user trùng, không tiết lộ thông tin nhạy cảm về account hiện có ngoài "email đã được sử dụng" | BR-002 | Test đăng ký trùng email → lỗi 409 rõ ràng |
| AC-003 | Given user có local credential hợp lệ, When đăng nhập đúng email+password, Then tạo session, set cookie httpOnly/secure/sameSite, `req.user.id` cho các request sau đúng bằng user đó | BR-005, BR-006 | Test login thành công → cookie set đúng flag, request tiếp theo tới protected endpoint trả đúng user |
| AC-004 | Given sai password nhiều lần liên tiếp trong khoảng thời gian ngắn, When tiếp tục thử, Then bị rate-limit/khoá tạm thời theo BR-010, kèm thông báo rõ ràng, không tiết lộ email có tồn tại hay không qua timing/thông báo khác biệt | BR-010 | Test brute-force simulate → bị chặn sau ngưỡng, response time/message không leak account existence |
| AC-005 | Given user bấm "Đăng nhập bằng Telegram", When hệ thống sinh `code` + deep link và user hoàn tất `/start <code>` trên Telegram trong thời hạn cho phép, Then trình duyệt phát hiện hoàn tất và có session hợp lệ cho đúng user Telegram đó | BR-009 | Test: bot fixture nhận đúng `/start <code>` hợp lệ, còn hạn → trình duyệt (cùng phiên đã sinh code) nhận session thành công |
| AC-005b | Given `code` đã hết hạn hoặc đã được dùng, When user gửi `/start <code>` đó (hoặc gửi lại lần 2), Then bot trả lời rõ ràng "mã không hợp lệ/đã hết hạn", không tạo/khớp session nào | BR-009 | Test: gửi `/start` với code hết hạn → bị từ chối; gửi lại code đã CLAIMED → bị từ chối, không tạo session thứ 2 |
| AC-005c | Given 1 trình duyệt B khác biết được `code` do trình duyệt A sinh ra (vd. lộ qua log/chia sẻ nhầm) nhưng không phải trình duyệt đã sinh code đó, When trình duyệt B poll kết quả bằng `code` này, Then KHÔNG được nhận session — chỉ trình duyệt đã sinh `code` (khớp qua session khởi tạo) mới claim được kết quả | BR-009 (chống hijack) | Test: sinh code bằng session A, giả lập poll bằng session/cookie khác B → bị từ chối dù `code` đúng |
| AC-006 | Given Telegram user (telegramUserId) chưa từng đăng nhập trước đó, When hoàn tất `/start <code>` lần đầu, Then hệ thống tạo `User` MỚI + `TelegramIdentity` liên kết — KHÔNG tự tìm user có email trùng hoặc bất kỳ heuristic nào để gộp | BR-002 | Test: Telegram login lần đầu luôn tạo user mới, không có logic tìm-kiếm-theo-email/username nào chạy |
| AC-007 | Given user đang đăng nhập bằng local password, When chọn "liên kết Telegram" và hoàn tất `/start <code>` hợp lệ cho đúng phiên đang liên kết, Then `TelegramIdentity` đó được gắn vào `User` hiện tại của session, chỉ khi `TelegramIdentity` đó CHƯA thuộc user nào khác | BR-003, BR-004 | Test: link thành công khi Telegram account chưa liên kết; test riêng: Telegram account đã thuộc user khác → bị từ chối rõ ràng, không chuyển quyền sở hữu |
| AC-008 | Given user đang đăng nhập bằng Telegram (chưa có local credential), When chọn "thêm email+password" và hoàn tất, Then local credential mới được gắn vào `User` hiện tại của session, chỉ khi email đó CHƯA được dùng bởi local credential khác | BR-003, BR-004 | Test: thêm local credential thành công; test riêng: email đã tồn tại ở user khác → bị từ chối, không gộp |
| AC-009 | Given user đã đăng nhập (bất kỳ phương thức nào), When logout, Then session bị huỷ phía server; request tiếp theo dùng cookie cũ không còn được coi là đã đăng nhập | BR-012 | Test: sau logout, gọi lại protected endpoint bằng cookie cũ → 401, không còn session record trong store |
| AC-010 | Given request POST/PUT/DELETE không kèm CSRF token hợp lệ, When gửi tới endpoint yêu cầu CSRF, Then bị từ chối (403), không thực hiện side effect | BR-006 | Test: gửi request thiếu/sai CSRF token → 403, state không đổi |
| AC-011 | Given user A đã đăng nhập, When user A gọi endpoint hoặc thao tác liên quan tới resource của user B, Then bị từ chối theo ownership check của feature đó dựa trên `req.user.id` đúng của A (feature này chỉ đảm bảo `req.user.id` đáng tin cậy; ownership check cụ thể do từng feature tự enforce) | BR-005 | Test: session của A gắn đúng `req.user.id` = A trong mọi request, không thể giả mạo thành B qua param/body |

## Financial definitions và UX
Không áp dụng — feature này không tính toán tài chính, không chạm Binance, không có khái niệm principal/interest/PnL/reservation. Chỉ có UX liên quan identity/session:
- Form đăng ký/đăng nhập rõ ràng phân biệt lỗi "sai password" vs "tài khoản không tồn tại" theo cách KHÔNG lộ email nào tồn tại trong hệ thống (dùng thông báo chung "email hoặc password không đúng").
- Nút "Đăng nhập với Telegram" mở deep link tới bot của platform (tab mới hoặc app Telegram nếu có cài); trong lúc chờ, UI hiển thị trạng thái "đang chờ xác nhận trên Telegram..." và tự cập nhật khi hoàn tất (không cần user bấm refresh thủ công), kèm thời gian còn lại trước khi `code` hết hạn và nút "Tạo mã mới" nếu hết hạn.
- Màn hình "Liên kết tài khoản" (trong khi đã đăng nhập) hiển thị rõ: phương thức nào đã liên kết, phương thức nào chưa, nút "liên kết Telegram" hoặc "thêm email+password" tuỳ trạng thái hiện tại, và thông báo lỗi rõ ràng nếu phương thức muốn liên kết đã thuộc account khác (không giải thích chi tiết account đó là gì, tránh leak thông tin).
- Logout có xác nhận đơn giản (không phải financial confirm).

## Edge cases
- User bấm "liên kết" nhưng đóng tab/mất mạng giữa chừng (giữa xác thực phương thức B và commit link) — không được tạo trạng thái nửa vời (identity B bị "treo" không thuộc user nào nhưng cũng không thể dùng lại). Cần transaction atomic khi ghi link.
- Hai request "liên kết Telegram" đồng thời từ 2 tab của cùng user, hoặc user cố link cùng 1 Telegram account vào 2 user khác nhau gần như đồng thời (race) — chỉ 1 được thành công, còn lại nhận lỗi "đã được liên kết", không có 2 user cùng sở hữu 1 Telegram identity.
- User bấm nút sinh `code` nhiều lần liên tiếp (nhiều tab, hoặc bấm lại vì tưởng lỗi) — mỗi `code` cũ chưa hết hạn vẫn phải hợp lệ hoặc bị vô hiệu hoá rõ ràng khi `code` mới được sinh cho cùng phiên, không được để nhiều `code` "còn sống" gây nhầm lẫn user gửi nhầm `/start` với `code` cũ.
- User gửi `/start <code>` nhưng `code` không tồn tại/sai định dạng (gõ tay sai, hoặc dùng lại tin nhắn cũ) — bot phải trả lời rõ ràng, không phải im lặng hoặc lỗi crash.
- Có bên thứ ba giả mạo request gửi thẳng tới endpoint nhận webhook của bot (không thông qua Telegram thật) để cố inject `/start <code>` với `code` hợp lệ đoán được — endpoint webhook phải xác thực request thực sự đến từ Telegram trước khi xử lý bất kỳ update nào.
- Trình duyệt đóng/mất mạng giữa lúc `code` đã CONFIRMED (bot đã nhận `/start` hợp lệ) nhưng chưa kịp claim session — user quay lại sau (trong hạn `code`) vẫn phải claim được, không mất kết quả.
- (Không áp dụng — BR-014 xác nhận không bắt buộc email verification ở MVP, mọi local credential login/link được ngay sau đăng ký bất kể trạng thái email.)
- Session store restart/crash — session đang active có bị mất không (user bị logout ngoài ý muốn) hay được phục hồi; phải nêu rõ trong architecture, không giả định.
- User cố truyền `userId` hoặc field định danh khác trong request body để giả mạo danh tính — backend phải bỏ qua hoàn toàn, chỉ tin session.
- Nhiều tab/thiết bị cùng đăng nhập 1 user — ngoài scope "quản lý session đa thiết bị" nhưng không được crash hay ghi đè session của nhau một cách không mong muốn (mỗi login tạo session riêng, không invalidate session khác trừ khi user chủ động logout đúng session đó).

## Open questions / risks / dependencies
- OQ-A01 | Owner: BA | Affected gate: BA_FEASIBILITY, ARCHITECTURE | Thuật toán hash password khuyến nghị hiện hành (bcrypt vs argon2, tham số cụ thể) và thư viện NestJS tương ứng — cần evidence từ tài liệu chính thức (BR-008).
- OQ-A02 | Owner: BA | Affected gate: BA_FEASIBILITY, ARCHITECTURE | Cơ chế session/cookie an toàn (httpOnly/secure/sameSite) và thư viện CSRF tương thích Express/NestJS còn được duy trì (nhiều thư viện CSRF cũ đã deprecated) — cần evidence tình trạng maintain (BR-006).
- OQ-A03 | Owner: BA | Affected gate: BA_FEASIBILITY, ARCHITECTURE | Cách deep-linking Telegram (`t.me/<bot>?start=<payload>`) hoạt động chính xác theo tài liệu chính thức core.telegram.org: ràng buộc ký tự/độ dài `payload`, cấu trúc update bot nhận được, và cách xác thực webhook nhận update thực sự đến từ Telegram (secret token header hay cơ chế khác) (BR-009).
- OQ-A04 | Owner: BA + architect | Affected gate: ARCHITECTURE | Cách quản lý session secret và Telegram bot token qua secret manager, không hardcode (BR-013).
- OQ-A10 | **RESOLVED** (2026-09-29) | User tự tạo bot Telegram qua BotFather và tự quản lý bot token/webhook secret token/webhook URL qua biến môi trường (.env, không commit).
- OQ-A05 | **RESOLVED** (2026-09-29) | Không bắt buộc email verification ở MVP → BR-014.
- OQ-A06 | **RESOLVED** (2026-09-29) | Session rolling 7 ngày, tuyệt đối 30 ngày → BR-011.
- OQ-A07 | **RESOLVED** (2026-09-29) | Rate-limit 5 lần sai/15 phút, khoá 15 phút theo account → BR-010.
- OQ-A08 | **RESOLVED** (2026-09-29) | Password tối thiểu 8 ký tự, không ép ký tự đặc biệt (NIST 800-63B) → BR-015.
- OQ-A09 | **RESOLVED** (2026-09-29) | Không có forgot-password ở MVP; user chấp nhận RISK-A02 (mất local credential chưa link Telegram = mất quyền truy cập vĩnh viễn qua đường local) → BR-016.

## Handoff checklist
- AC-001..AC-011 (gồm AC-005b, AC-005c) trace tới BR-001..BR-016.
- OQ-A01/A02/A03/A04 đã được BA verify bằng tài liệu chính thức ở gate trước. OQ-A05/A06/A07/A08/A09/A10 đã được Product + user quyết định nghiệp vụ (2026-09-29) — không còn OPEN_QUESTION nào chặn gate này; giá trị cụ thể đã điền vào BR-010/011/014/015/016.
- Giữ nguyên quyết định nghiệp vụ đã chốt trước đó bởi user (2 phương thức đăng nhập, không auto-merge, link thủ công) — không phải giả định mới của agent này.
- Đề xuất requirement_status: READY (đủ để BA feasibility review — về mặt nội dung đây là điền giá trị cấu hình vào các placeholder mà BA/architecture trước đó đã thiết kế để nhận, không đổi schema/thiết kế kỹ thuật).
