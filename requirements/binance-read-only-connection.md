# Requirement: binance-read-only-connection

Revision: r1-2026-09-29 | Owner: product-requirement-agent | Decision: features/binance-read-only-connection/decision.json

## Problem, user và outcome
Nền tảng hỗ trợ quyết định vay margin cần dữ liệu Binance Margin của chính user (balance, borrow, liability, orders) để mọi module downstream (Margin Dashboard, Risk Engine, Capital Provenance Ledger...) hoạt động. Hiện chưa có cách nào để user kết nối tài khoản Binance của họ vào hệ thống một cách an toàn.

Feature này chỉ giải quyết: user (đã đăng nhập vào platform hosted, multi-user) cung cấp Binance API credentials của chính họ, hệ thống lưu trữ an toàn, xác minh key hợp lệ và scope đúng, sau đó cho phép đọc (READ_ONLY tuyệt đối) dữ liệu Binance Margin — Binance.com, Cross Margin Classic — thuộc riêng user đó. Không đặt lệnh, không vay, không trả nợ, không ghi bất kỳ mutation nào lên Binance trong feature này.

Outcome đo được:
- User tự thêm/xóa một Binance API key connection cho tài khoản của họ.
- Hệ thống xác minh connection: key hợp lệ, thuộc đúng account mode (Cross Margin), permission scope không vượt quá READ_ONLY cần thiết (từ chối/flag key có withdraw hoặc trading permission nếu Binance cho phép phát hiện qua API).
- Sau khi verified, user xem được ít nhất: margin account balance, borrowed asset outstanding, liability (principal + interest theo field Binance trả về), tại thời điểm gọi (không cache giả định freshness).
- Mỗi user chỉ thấy connection và dữ liệu của chính họ (ownership per-user, không leak cross-user).

Không hứa lợi nhuận, không dự đoán giá, không phải trading bot. Đây là nền cho các feature sau, không phải sản phẩm hoàn chỉnh.

## Scope / MVP / non-goals
In-scope (MVP):
- Thêm Binance API key (API key + secret) gắn với 1 user, 1 Binance account, Binance.com, Cross Margin Classic.
- Xác minh connection ngay khi thêm: gọi Binance API để test key còn hiệu lực và đọc được margin account.
- Xem trạng thái connection (verified / invalid / permission-too-broad / error) và thời điểm verify gần nhất.
- Đọc (on-demand, do user trigger hoặc trang load, không background poll tự động trong feature này): margin account balance, borrowed assets + liability, danh sách margin open orders/trade history ở mức tối thiểu cần cho module tiếp theo.
- Xóa (revoke) connection — chỉ xóa khỏi hệ thống, không thu hồi key trên Binance (user tự làm trên Binance nếu cần).
- Chế độ hệ thống là READ_ONLY mặc định cho toàn bộ platform ở giai đoạn này; feature không implement PAPER_TRADING hay LIVE.

Out-of-scope (feature khác):
- Borrow/repay/buy/sell (Binance Execution module).
- Margin Dashboard UI tổng hợp, Risk Engine, Capital Provenance Ledger, Overvaluation Scoring — dùng data này làm input nhưng thiết kế riêng.
- Background polling/scheduler tự động đọc định kỳ (có thể là feature riêng sau; nếu cần, phải qua BA lại vì liên quan rate limit/freshness policy).
- Sub-account, Isolated Margin, Futures, Spot-only account — ngoài phạm vi Cross Margin Classic đã chốt.
- Multi-region/non-Vietnam compliance nuances — sản phẩm nhắm user Việt Nam dùng Binance.com trước.

Dependencies: cần BA xác minh chính xác endpoint Binance (permission field, margin account field semantics) trước khi architecture chốt API contract — xem Open questions.

READ_ONLY behavior: toàn bộ API call trong feature này chỉ dùng HTTP method/endpoint đọc dữ liệu (GET). Không được cấu hình hoặc dùng endpoint có khả năng mutate (borrow, repay, order, transfer) dù chỉ để "test". Nếu Binance permission scope của key user cung cấp bao gồm trading/withdraw, hệ thống phải cảnh báo rõ và khuyến nghị user tạo key hẹp hơn — không tự động từ chối cứng nếu Binance không cho cách phát hiện chắc chắn qua API (ghi OPEN_QUESTION, xem dưới).

## User stories
- US-001: Là user đã đăng nhập, tôi muốn thêm Binance API key của tôi để hệ thống đọc được dữ liệu margin account của tôi.
- US-002: Là user, tôi muốn được biết ngay nếu key tôi nhập sai, hết hạn, hoặc thuộc account mode không được hỗ trợ (không phải Cross Margin Classic), để tôi sửa lại.
- US-003: Là user, tôi muốn được cảnh báo nếu API key tôi cung cấp có quyền vượt quá mức cần thiết (ví dụ có quyền rút tiền/giao dịch), để tôi tạo lại key an toàn hơn.
- US-004: Là user, tôi muốn xem balance, borrowed asset và liability hiện tại của tài khoản margin của tôi ngay sau khi connection verified.
- US-005: Là user, tôi muốn xóa connection Binance của tôi bất cứ lúc nào và biết chắc hệ thống ngừng dùng key đó ngay lập tức.
- US-006: Là user, tôi không muốn thấy hoặc truy cập được connection/dữ liệu Binance của user khác.

## Business rules
| ID | Rule + units | Source | Verification / question |
|---|---|---|---|
| BR-001 | Hệ thống chỉ hỗ trợ Binance.com, Cross Margin Classic account mode trong feature này. | Quyết định nghiệp vụ user (đã chốt trước đó) | Verified (business decision, không phải API fact) |
| BR-002 | Toàn bộ thao tác với Binance trong feature này là READ_ONLY; không có code path nào gọi write/mutation endpoint. | AGENTS.md, docs/RISK_RULES.md | Verified (kiến trúc phải enforce, không chỉ ẩn UI) |
| BR-003 | Mỗi Binance connection thuộc về đúng 1 user (ownership); truy vấn dữ liệu phải scope theo user đang đăng nhập. | Yêu cầu hosted multi-user | Verified (nguyên tắc bảo mật cơ bản, không phải API fact) |
| BR-004 | API key/secret không được lưu plaintext; không log secret; không đưa secret vào response ngoài lần nhập ban đầu. | AGENTS.md, docs/BINANCE_INTEGRATION.md | Verified (nguyên tắc bắt buộc) |
| BR-005 | Verify connection nghĩa là: gọi được margin account endpoint thành công VÀ xác nhận account đúng là Cross Margin Classic. | Cần BA xác minh field nào của Binance response cho biết account mode | NEEDS_VERIFICATION (BA) |
| BR-006 | Phát hiện permission scope của API key (để cảnh báo US-003) dựa trên field Binance trả về cho biết permissions của key (nếu có). | Cần BA xác minh Binance có endpoint/field lộ permission của key hay không | NEEDS_VERIFICATION (BA) |
| BR-007 | Liability = principal + interest theo đúng field Binance trả về; không tự cộng interest nếu field đã bao gồm. | docs/DOMAIN.md | NEEDS_VERIFICATION (BA phải xác nhận field chính xác) |
| BR-008 | Dữ liệu đọc được trả về kèm timestamp thời điểm gọi Binance (không giả định freshness khi không có polling). | docs/BINANCE_INTEGRATION.md | Verified (nguyên tắc bắt buộc) |

## Acceptance criteria
| ID | Given / When / Then | Rule | Expected evidence |
|---|---|---|---|
| AC-001 | Given user đã đăng nhập, When user nhập API key + secret hợp lệ thuộc Cross Margin Classic, Then connection được lưu (secret encrypted) và trạng thái chuyển "verified" kèm timestamp | BR-001, BR-004, BR-005 | Test verify thành công với fixture/mocked response margin account đúng mode |
| AC-002 | Given user nhập key sai hoặc hết hạn, When hệ thống gọi verify, Then trạng thái "invalid" kèm lý do, secret không được lưu ở trạng thái verified | BR-005 | Test với key invalid → lỗi rõ ràng, không throw lộ secret trong log/response |
| AC-003 | Given key hợp lệ nhưng account không phải Cross Margin Classic (ví dụ Isolated Margin hoặc Spot), When verify, Then hệ thống từ chối với thông báo rõ account mode không hỗ trợ | BR-001, BR-005 | Test fixture account mode khác Cross Margin Classic bị reject |
| AC-004 | Given key có permission vượt quá cần thiết (nếu Binance cho phát hiện được), When verify, Then hệ thống hiển thị cảnh báo permission-too-broad nhưng vẫn cho phép dùng ở chế độ đọc nếu user xác nhận đã hiểu rủi ro | BR-006 | Test fixture permission field có trading/withdraw → cảnh báo hiển thị; nếu Binance không cho phát hiện được, ghi rõ giới hạn này trong UI/docs thay vì giả định an toàn |
| AC-005 | Given connection verified, When user xem dashboard, Then hệ thống gọi Binance đọc balance/borrow/liability và hiển thị kèm timestamp thời điểm gọi, không dùng dữ liệu cache không rõ tuổi | BR-007, BR-008 | Test integration/mocked response hiển thị đúng số liệu + timestamp |
| AC-006 | Given 2 user khác nhau mỗi người có 1 connection, When user A truy vấn, Then chỉ thấy connection/dữ liệu của A, không thấy của B kể cả qua thao tác trực tiếp API (IDOR) | BR-003 | Test cố tình truy cập connection ID của user khác → 403/404, không lộ dữ liệu |
| AC-007 | Given user xóa connection, When xóa xong, Then hệ thống không còn gọi Binance bằng key đó nữa và secret bị xóa khỏi storage (không chỉ ẩn khỏi UI) | BR-004 | Test xóa xong, thử gọi lại đọc dữ liệu → phải fail vì key không còn tồn tại nội bộ |
| AC-008 | Given Binance API trả lỗi (rate limit, timeout, signature invalid, network), When hệ thống gọi đọc dữ liệu, Then hiển thị lỗi rõ ràng cho user, không throw exception làm crash, không retry ngầm vô hạn | docs/BINANCE_INTEGRATION.md | Test simulate timeout/rate-limit/lỗi transport → UI báo lỗi, log không chứa secret |

## Financial definitions và UX
- Balance, borrowed amount, liability hiển thị theo đúng unit và precision Binance trả về (string/decimal), không convert qua float. Không có công thức tính toán mới trong feature này (chỉ đọc và hiển thị nguyên trạng dữ liệu Binance); mọi phép tính phái sinh (exposure, PnL, risk...) thuộc feature khác.
- first_borrow_entry_price, initial exposure, reserved proceeds — KHÔNG thuộc phạm vi feature này (không có ghi nhận vay/bán trong feature này), chỉ nêu ở đây để khẳng định feature không tự suy diễn các khái niệm đó từ dữ liệu đọc được.
- UX: form nhập key rõ ràng cảnh báo "chỉ nhập API key có quyền đọc (read-only), không bật quyền rút tiền/giao dịch nếu không cần"; hiển thị trạng thái verify realtime sau khi submit; hiển thị rõ "dữ liệu tại thời điểm HH:MM:SS UTC" mỗi lần load.
- Không có bước preview/confirm giao dịch trong feature này vì không có mutation nào được thực hiện.

## Edge cases
- User nhập key/secret có khoảng trắng thừa hoặc ký tự ẩn — cần trim nhưng không tự "sửa" và validate silently sai.
- User có nhiều connection cho cùng 1 Binance account (trùng) — cần quyết định cho phép hay chặn trùng (OPEN_QUESTION).
- Binance trả HTTP 200 nhưng field thiếu/null (partial response) — không được hiển thị 0 ngầm định (theo docs/DOMAIN.md: "missing/stale data không được im lặng thành zero").
- Rate limit khi nhiều user cùng verify/đọc cùng lúc — cần backoff/queue chứ không được chặn toàn hệ thống.
- User đổi permission của key trên Binance sau khi đã verified (ví dụ tự thêm quyền trading) — hệ thống không polling liên tục nên có thể không phát hiện ngay; cần quyết định có re-verify định kỳ hay chỉ khi user chủ động (OPEN_QUESTION, ảnh hưởng scope polling).
- User xóa connection trong lúc có request đang gọi Binance dở dang — không được để race condition dùng key đã xóa.
- Clock skew giữa server và Binance làm signature request bị từ chối — cần xử lý theo transport requirement của Binance (BA xác minh).
- Timeout khi verify: không được kết luận "invalid" nếu thực chất là timeout/network — phải phân biệt UNKNOWN vs INVALID (theo AGENTS.md: timeout không đồng nghĩa thất bại).

## Open questions / risks / dependencies
- OQ-R01 | Owner: BA | Affected gate: BA_FEASIBILITY, ARCHITECTURE | Binance Margin API endpoint chính xác nào dùng để xác minh account mode là Cross Margin Classic, và field nào phân biệt với Isolated Margin/Spot? Chặn thiết kế AC-001/AC-003 nếu chưa có evidence.
- OQ-R02 | Owner: BA | Affected gate: BA_FEASIBILITY, ARCHITECTURE | Binance API key có expose được permission scope (trading/withdraw enabled) qua endpoint nào không? Nếu không thể, AC-004 phải điều chỉnh xuống mức "hiển thị disclaimer" thay vì "phát hiện tự động". Chặn nếu chưa rõ.
- OQ-R03 | Owner: Product + user | Affected gate: ARCHITECTURE | Có cho phép user thêm nhiều connection trùng cùng 1 Binance account không, hoặc giới hạn 1 connection/account/user? Chưa chốt, không tự chọn.
- OQ-R04 | Owner: Product + BA + user | Affected gate: ARCHITECTURE (ảnh hưởng scope, không chặn thiết kế MVP hiện tại vì MVP là on-demand read) | Có cần background re-verify định kỳ để phát hiện permission thay đổi hoặc key bị revoke trên Binance không? Nếu có, là feature/scope riêng cần rate-limit và scheduler policy.
- OQ-R05 | Owner: BA | Affected gate: BA_FEASIBILITY | Binance có Margin sandbox/testnet thật sự hỗ trợ Cross Margin không, hay chỉ Spot testnet? Ảnh hưởng test strategy của architecture và QA (không được giả định Spot testnet bao phủ Margin).
- Risk: Nếu Binance không cho cách xác thực chắc chắn permission scope, hệ thống chỉ có thể cảnh báo dựa trên disclaimer, không phải enforcement kỹ thuật — cần user chấp nhận residual risk này ở UI.

## Handoff checklist
- AC-001..AC-008 trace tới BR-001..BR-008; mọi rule chưa verified được gắn NEEDS_VERIFICATION rõ ràng cho BA.
- Scope đủ cho BA feasibility: đã liệt kê đúng những gì cần Binance official doc verify (OQ-R01, OQ-R02, OQ-R05) trước khi architecture chốt API contract.
- Assumption nghiệp vụ đã có (Binance.com, Cross Margin Classic, hosted multi-user, Việt Nam, READ_ONLY) được gắn nhãn "quyết định nghiệp vụ đã chốt trước đó bởi user", không phải giả định mới của agent này.
- Đề xuất requirement_status: READY (đủ để BA feasibility review). Không tự duyệt BA; BA phải review và có thể BLOCKED nếu OQ-R01/OQ-R02/OQ-R05 không có evidence.
