# Requirement: capital-provenance-ledger

Revision: r1-2026-10-01 | Owner: product-requirement-agent | Decision: features/capital-provenance-ledger/decision.json

## Problem, user và outcome
Hệ thống hiện đã đọc được balance/borrow/liability từ Binance (feature `binance-read-only-connection`), nhưng Binance account balance không cho biết **nguồn gốc vốn**: không thể biết một lượng BTC/ETH đang nắm giữ là mua bằng tiền cá nhân hay bằng tiền vay (và vay nào), nên không thể biết phải trích bao nhiêu tiền bán ra để dành trả nợ. Không có ledger này, user không có cách nào biết chắc "tôi còn bao nhiêu vốn thực sự tự do để vay/đầu tư tiếp" — rủi ro dùng nhầm tiền phải trả nợ như tiền tự do.

User: cá nhân user đã đăng nhập, đã kết nối Binance (feature `binance-read-only-connection`), đang tự thực hiện các giao dịch vay/bán/mua/trả nợ trên Binance (chưa có `Binance Execution` tự động trong hệ thống — feature đó NOT_STARTED). Vì vậy user **tự ghi nhận** từng sự kiện (vay, bán, mua, trả nợ) vào hệ thống ngay sau khi họ thực hiện trên Binance; hệ thống không tự suy ra các sự kiện này từ balance snapshot.

Outcome đo được:
- User ghi nhận một Borrow Position mới (asset vay, quantity, first_borrow_entry_price) khi họ vay trên Binance.
- User ghi nhận sự kiện bán asset vay → USDT (proceeds thực nhận, fee) gắn với đúng Borrow Position.
- User ghi nhận sự kiện mua BTC/ETH bằng USDT đó → tạo một allocation lot gắn với đúng 1 nguồn vốn (personal hoặc đúng 1 Borrow Position, không mixed — xem Business rules).
- Khi user ghi nhận bán lot BTC/ETH đó, hệ thống tự động tính và hiển thị số tiền phải reserve (giữ lại, không phải free capital) cho tới khi Borrow Position liên quan được trả hết.
- User ghi nhận sự kiện trả nợ (repay) → giảm liability của Borrow Position; khi liability về 0 và không còn lot nào đang reserve, surplus (nếu còn) được giải phóng thành free capital.
- Hệ thống phát hiện và cảnh báo khi hoạt động trên Binance (đọc qua `binance-read-only-connection`) không khớp với ledger nội bộ (external/unattributed activity) thay vì im lặng bỏ qua.
- Mọi số tiền "available/free capital" hiển thị cho user đã trừ phần reserved; không có chỗ nào cộng gộp reserved vào free capital.

Không phải sổ kế toán thuế, không tính PnL thực hiện (Profit & Repay Calculator là feature khác dùng ledger này làm input). Không thực hiện bất kỳ giao dịch nào trên Binance (READ_ONLY cho phần kết nối; ghi nhận ledger là thao tác nội bộ, không gọi Binance write endpoint).

## Scope / MVP / non-goals
In-scope (MVP):
- CRUD ghi nhận (append-only, xem Business rules) các sự kiện: `BORROW_OPENED`, `ASSET_SOLD` (vay → USDT), `ASSET_BOUGHT` (USDT → BTC/ETH, tạo lot), `LOT_SOLD` (BTC/ETH → USDT, disposal), `REPAY` (giảm liability).
- Một Borrow Position: asset vay, quantity, `first_borrow_entry_price` (immutable sau khi set), liability hiện tại (principal + interest do user nhập hoặc đối chiếu từ Binance read-only — xem BR-007), trạng thái OPEN/REPAID.
- Giới hạn: tối đa 1 Borrow Position **đang OPEN** cho mỗi (user, borrowed asset). Phải REPAID position cũ trước khi mở position mới cùng asset (BR-002).
- Một allocation lot (BTC/ETH) gắn với **đúng 1 nguồn vốn**: hoặc `PERSONAL`, hoặc đúng 1 Borrow Position. Không hỗ trợ lot có nhiều nguồn vốn trộn lẫn trong MVP (BR-003).
- Khi bán một phần hoặc toàn bộ lot funded từ Borrow Position: 100% proceeds thực nhận của phần bán đó bị reserve, gắn với Borrow Position đó, cho tới khi Borrow Position REPAID (BR-005). Không release surplus sớm trong MVP.
- Khi Borrow Position chuyển REPAID (liability về 0 theo ghi nhận user/đối chiếu Binance): toàn bộ reserved proceeds còn lại gắn với position đó được giải phóng thành free capital (BR-006).
- Đối chiếu (reconciliation) thủ công: user có thể trigger so sánh snapshot Binance (từ `binance-read-only-connection`: borrowed asset outstanding, liability) với dữ liệu ledger nội bộ; lệch được hiển thị rõ là "drift", không tự động sửa ledger.
- Chỉ BTC, ETH là allocation asset được enforce invariant reserved-proceeds trong MVP (BR-004). SOL không nằm trong scope v1.
- Toàn bộ số tiền/số lượng dùng Decimal, ghi rõ unit; không dùng float.

Out-of-scope (feature khác hoặc v2, không tự mở rộng):
- Tự động ghi sự kiện từ Binance trade history (chưa có; MVP là user tự nhập). Tự động hoá là feature riêng sau, cần BA lại vì liên quan rate-limit/idempotency.
- Mixed-source lot (pro-rata/FIFO/LIFO khi 1 lot có nhiều nguồn vốn) — OQ-P01 đã quyết **chặn** ở MVP (xem Business rules), chính sách phân bổ thật sự hoãn sang v2.
- Nhiều Borrow Position cùng asset mở song song và chính sách phân bổ interest/repay giữa chúng (OQ-P04) — MVP giới hạn 1 position/asset nên không phát sinh.
- Release surplus sớm theo liability cap (OQ-P02 phương án 2) — MVP reserve 100% tới khi REPAID.
- SOL allocation/invariant (OQ-P03) — ngoài scope v1.
- Fee/dust/partial repay/debt shortfall/external transfer tự động xử lý (OQ-P05) — MVP chỉ phát hiện và quarantine, không tự tính toán phân bổ (xem Edge cases, Open questions).
- Borrow Position Manager UI đầy đủ, Risk Engine (so sánh exposure/collateral), Profit & Repay Calculator — dùng ledger này làm input, thiết kế riêng.
- Binance Execution (tự động vay/bán/mua/trả) — chưa tồn tại; feature này không phụ thuộc và không chuẩn bị cho nó ngoài việc để lại event schema mở rộng được.

Dependencies: `binance-read-only-connection` (đọc liability/borrowed asset để đối chiếu — đã QA PASS_WITH_WARNINGS), `user-authentication` (ownership per-user — đã QA PASS_WITH_WARNINGS).

READ_ONLY/PAPER_TRADING/LIVE: feature này không gọi Binance write endpoint nào; "ghi nhận sự kiện" là thao tác nội bộ (giống nhật ký), không phải thực thi giao dịch. Áp dụng cho mọi mode (READ_ONLY/PAPER_TRADING/LIVE) như nhau vì không execute; không có bước preview/confirm giao dịch Binance trong feature này.

## User stories
- US-001: Là user, tôi muốn ghi nhận một khoản vay (Borrow Position) với first entry price, để hệ thống bắt đầu theo dõi nguồn vốn từ khoản vay đó.
- US-002: Là user, tôi muốn ghi nhận việc bán asset vay thành USDT, để hệ thống biết số USDT đó đến từ khoản vay nào.
- US-003: Là user, tôi muốn ghi nhận việc dùng USDT đó mua BTC/ETH, để hệ thống tạo một lot và biết lot đó funded từ nguồn nào.
- US-004: Là user, khi tôi bán một lot BTC/ETH funded từ khoản vay, tôi muốn biết chính xác số tiền phải giữ lại (reserved) để trả nợ, không lẫn với tiền tự do của tôi.
- US-005: Là user, khi tôi trả hết một khoản vay, tôi muốn hệ thống tự giải phóng phần tiền dư (nếu có) thành vốn tự do.
- US-006: Là user, tôi muốn biết ngay nếu dữ liệu Binance thực tế (balance/liability) không khớp với ledger nội bộ của tôi, để tôi không ra quyết định dựa trên số liệu sai.
- US-007: Là user, tôi muốn hệ thống từ chối cho tôi mở khoản vay thứ 2 cùng 1 asset khi khoản vay cũ chưa trả hết, để tránh case phân bổ nợ phức tạp chưa được hỗ trợ.
- US-008: Là user, nếu tôi cố ghi nhận một lot được mua từ nhiều nguồn vốn trộn lẫn, tôi muốn hệ thống từ chối/yêu cầu tôi tách rõ nguồn trước, thay vì tự đoán cách chia.

## Business rules
| ID | Rule + units | Source | Verification / question |
|---|---|---|---|
| BR-001 | Mỗi Borrow Position, allocation lot, event đều thuộc về đúng 1 user (ownership); mọi query scope theo user đang đăng nhập. | Yêu cầu hosted multi-user (đã áp dụng ở `user-authentication`, `binance-read-only-connection`) | Verified (nguyên tắc bảo mật cơ bản) |
| BR-002 | Tối đa 1 Borrow Position trạng thái OPEN cho mỗi (user, borrowed asset) tại một thời điểm. Tạo mới cùng asset khi còn 1 position OPEN phải bị từ chối. | Quyết định user 2026-10-01 (giải quyết OQ-P04 cho MVP) | Verified (quyết định nghiệp vụ đã chốt) |
| BR-003 | Một allocation lot (BTC/ETH) phải gắn với đúng 1 nguồn vốn: `PERSONAL` hoặc đúng 1 `borrowPositionId`. Không có lot nào có nhiều nguồn vốn trong MVP. | Quyết định user 2026-10-01 (giải quyết OQ-P01 cho MVP) | Verified (quyết định nghiệp vụ đã chốt) |
| BR-004 | Reserved-proceeds / sell-to-repay invariant chỉ áp dụng cho BTC và ETH trong MVP. SOL không bị enforce invariant này; event liên quan SOL (nếu user cố ghi nhận) bị từ chối hoặc đánh dấu rõ "không được ledger này theo dõi", không được âm thầm bỏ qua. | AGENTS.md (invariant BTC/ETH), quyết định user 2026-10-01 (giải quyết OQ-P03 cho MVP) | Verified (quyết định nghiệp vụ đã chốt) |
| BR-005 | Khi ghi nhận `LOT_SOLD` cho lot funded từ Borrow Position X: 100% proceeds thực nhận (sau fee, theo số liệu user nhập, không theo giá preview) của phần bán đó được cộng vào `reservedAmount` của X; không được dùng làm free capital cho tới khi X REPAID. | docs/CAPITAL_PROVENANCE.md, quyết định user 2026-10-01 (giải quyết OQ-P02 cho MVP) | Verified (quyết định nghiệp vụ đã chốt) |
| BR-006 | Khi Borrow Position chuyển REPAID (liability = 0), toàn bộ `reservedAmount` còn lại gắn với position đó được giải phóng thành free capital ngay lập tức; không giữ lại "phòng hờ" thêm nếu không có lý do nghiệp vụ mới. | docs/CAPITAL_PROVENANCE.md | Verified (hệ quả trực tiếp của BR-005) |
| BR-007 | Liability của Borrow Position = giá trị user tự nhập tại mỗi sự kiện REPAY/đối chiếu, có thể được so sánh (không tự ghi đè) với liability đọc từ Binance qua `binance-read-only-connection`. Ledger không tự tính interest; interest là số Binance trả về hoặc user nhập thủ công. | docs/DOMAIN.md ("Không cộng interest lần nữa nếu exchange field đã bao gồm") | NEEDS_VERIFICATION (BA xác nhận UX đối chiếu: hiển thị cả 2 số, không tự merge) |
| BR-008 | Mọi event (`BORROW_OPENED`, `ASSET_SOLD`, `ASSET_BOUGHT`, `LOT_SOLD`, `REPAY`) là append-only; sửa/huỷ một event đã ghi phải tạo event correction/reversal mới tham chiếu event gốc, không update/delete field của event cũ. | AGENTS.md, docs/CAPITAL_PROVENANCE.md | Verified (nguyên tắc bắt buộc) |
| BR-009 | Reconciliation so sánh borrowed asset outstanding + liability (từ Binance read-only) với tổng theo ledger nội bộ; nếu lệch vượt ngưỡng xác định, đánh dấu Borrow Position ở trạng thái `DRIFT_DETECTED` và chặn tạo `LOT_SOLD`/`REPAY` mới liên quan cho tới khi user xác nhận/điều chỉnh. | docs/CAPITAL_PROVENANCE.md ("phải phát hiện drift, quarantine phần chưa phân loại và chặn hành động phụ thuộc cho tới reconcile") | NEEDS_VERIFICATION (BA xác định ngưỡng lệch chấp nhận được — dust/rounding vs lệch thật) |
| BR-010 | Available/free capital hiển thị cho user = vốn cá nhân xác định + reserved đã release − reserved hiện tại; không bao giờ cộng `reservedAmount` đang giữ vào số này. | docs/CAPITAL_PROVENANCE.md ("Reserved proceeds... bị loại khỏi capital có thể tái sử dụng") | Verified (định nghĩa bắt buộc) |

## Acceptance criteria
| ID | Given / When / Then | Rule | Expected evidence |
|---|---|---|---|
| AC-001 | Given user chưa có Borrow Position OPEN cho asset X, When user ghi nhận `BORROW_OPENED` với asset X, quantity, first_borrow_entry_price, Then hệ thống tạo Borrow Position OPEN, `first_borrow_entry_price` immutable từ đây | BR-002 | Test tạo thành công, thử sửa first_borrow_entry_price sau đó → bị từ chối |
| AC-002 | Given user đã có Borrow Position OPEN cho asset X, When user ghi nhận `BORROW_OPENED` asset X lần nữa, Then hệ thống từ chối kèm thông báo rõ lý do (phải repay position cũ trước) | BR-002 | Test tạo lần 2 cùng asset khi position 1 còn OPEN → reject |
| AC-003 | Given Borrow Position X đã bán asset vay lấy USDT (`ASSET_SOLD`), When user ghi nhận `ASSET_BOUGHT` BTC/ETH dùng đúng số USDT đó và chọn nguồn = X, Then lot mới được tạo với `fundingSource = Borrow Position X` | BR-003 | Test tạo lot thành công, lot trace được về đúng X |
| AC-004 | Given user cố ghi nhận 1 lot với nguồn vốn gồm cả PERSONAL và 1 Borrow Position (mixed), When submit, Then hệ thống từ chối và yêu cầu tách thành các lot riêng theo từng nguồn | BR-003 | Test input mixed-source → reject, message hướng dẫn tách lot |
| AC-005 | Given lot Y funded từ Borrow Position X với cost basis 6,000 USDT, When user ghi nhận `LOT_SOLD` bán 50% lot Y với proceeds thực nhận 3,500 USDT, Then `reservedAmount` của X tăng thêm 3,500 USDT và UI hiển thị rõ đây là reserved, không phải free capital | BR-005, BR-010 | Test số liệu reserved tăng đúng, available capital không đổi |
| AC-006 | Given Borrow Position X có `reservedAmount` = 8,000 USDT và liability giảm về 0 qua sự kiện `REPAY`, When REPAY cuối cùng được ghi nhận, Then X chuyển REPAID và 8,000 USDT reserved được giải phóng thành free capital ngay | BR-006 | Test trạng thái X = REPAID, free capital tăng đúng 8,000, event log ghi rõ release |
| AC-007 | Given ledger ghi nhận Borrow Position X còn liability 2,000 USDT, When user trigger reconciliation và Binance read-only trả về liability thực tế 2,500 USDT (lệch > ngưỡng), Then X chuyển `DRIFT_DETECTED`, hiển thị cả 2 số, và chặn ghi `LOT_SOLD`/`REPAY` mới cho X cho tới khi user xác nhận xử lý | BR-007, BR-009 | Test fixture lệch số liệu → trạng thái DRIFT_DETECTED, thao tác bị chặn, log rõ 2 nguồn số liệu |
| AC-008 | Given một event `ASSET_SOLD` đã ghi nhận sai số liệu, When user cần sửa, Then hệ thống tạo event reversal/correction mới tham chiếu event gốc; event gốc vẫn còn nguyên trong lịch sử, không bị update/xoá | BR-008 | Test sửa → 2 record tồn tại (gốc + correction), query lịch sử thấy cả 2 |
| AC-009 | Given user cố ghi nhận event liên quan SOL (`ASSET_BOUGHT` SOL dùng nguồn Borrow Position), When submit, Then hệ thống từ chối hoặc đánh dấu rõ "SOL không được ledger này theo dõi ở v1" thay vì tạo lot với invariant sai | BR-004 | Test input SOL → reject/explicit-unsupported message, không tạo lot âm thầm |
| AC-010 | Given user A và user B đều có Borrow Position, When user A gọi API lấy chi tiết Borrow Position của B (qua ID), Then hệ thống trả 403/404, không lộ dữ liệu | BR-001 | Test IDOR giống pattern đã áp dụng ở `binance-read-only-connection` |

## Financial định nghĩa và UX
- Tất cả quantity/USDT dùng Decimal với precision khớp asset (BTC/ETH theo số decimal Binance trả về khi đối chiếu); không float trong lưu trữ hoặc tính toán.
- UI phải phân biệt rõ 3 số cho mỗi Borrow Position: liability hiện tại (ledger), liability từ Binance (nếu đã đối chiếu), reservedAmount — không gộp thành 1 con số mơ hồ.
- Free/available capital hiển thị toàn hệ thống (không riêng theo position) = tổng vốn cá nhân xác định − tổng reservedAmount đang giữ của mọi Borrow Position; luôn hiển thị kèm thời điểm tính (không cache ngầm).
- Không có bước preview/confirm giao dịch Binance trong feature này (không gọi Binance write); nhưng mỗi form ghi nhận event (đặc biệt `LOT_SOLD`, `REPAY`) phải có bước xác nhận trước khi lưu vì đây là dữ liệu tài chính append-only, sửa sai phải qua correction event (BR-008), không "sửa nhanh".
- rounding mode cho phân bổ fee vào proceeds: NEEDS_VERIFICATION (BA) — chưa chốt làm tròn xuống hay theo đúng giá trị Binance trả về không làm tròn thêm.

## Edge cases
- User ghi nhận `LOT_SOLD` vượt quá quantity còn lại của lot (do nhầm lẫn) — phải từ chối, không cho reservedAmount âm hoặc vượt cost basis.
- User ghi nhận `REPAY` vượt quá liability hiện tại (trả dư) — hệ thống phải hỏi rõ phần dư đi đâu (không tự động coi là free capital); nếu chưa có chính sách, đây là một phần của OQ-P05 (shortfall/dust), ghi OPEN_QUESTION và chặn tự động hoá, chỉ cho phép ghi nhận "overpayment" ở trạng thái cần user làm rõ thủ công.
- Fee của giao dịch bán/mua trả bằng token khác (ví dụ BNB) thay vì trừ trực tiếp vào proceeds — MVP: bắt buộc user nhập proceeds **thực nhận sau fee** theo đúng unit (USDT), không tự tính quy đổi fee token khác; nếu fee ảnh hưởng unit khác, ghi là unresolved (OQ-P05) và yêu cầu user xử lý ngoài ledger cho tới khi có chính sách.
- Concurrent event cho cùng Borrow Position (2 request ghi `LOT_SOLD` gần như đồng thời) — phải có concurrency control (ví dụ optimistic lock theo version) để tránh 2 event cùng cộng dồn reservedAmount sai; đây là yêu cầu AC, chi tiết cơ chế để architecture quyết.
- Reconciliation chạy khi Borrow Position đã REPAID (archived) — vẫn phải cho xem lịch sử, không ẩn/xoá vì đã đóng.
- External activity: user tự bán/mua/trả nợ trực tiếp trên Binance mà quên ghi vào ledger — khi reconciliation phát hiện lệch, không được tự "đoán" event nào đã xảy ra; chỉ hiển thị drift và yêu cầu user tự ghi nhận bổ sung hoặc xác nhận đó là hoạt động cá nhân ngoài scope.
- Timeout/lỗi khi đọc Binance để đối chiếu — không được kết luận "không có drift"; phải hiển thị "chưa đối chiếu được" khác với "đã đối chiếu, khớp" (theo AGENTS.md: timeout không đồng nghĩa thất bại/thành công).
- User xoá Borrow Position đã REPAID — không cho phép xoá (append-only, audit); chỉ có thể archive/ẩn khỏi danh sách active.

## Open questions / risks / dependencies
- OQ-P05 | Owner: BA + user | Affected gate: BA_FEASIBILITY, ARCHITECTURE | Fee token khác, dust còn lại sau repay, partial repay vượt/thiếu liability, external transfer chưa phân loại: MVP hiện chỉ "phát hiện và chặn tự động hoá, yêu cầu user xử lý thủ công" (xem Edge cases) thay vì tính toán tự động. BA cần xác nhận mức tối thiểu này đã đủ cho MVP hay cần policy cụ thể hơn trước ARCHITECTURE.
- OQ-C01 | Owner: BA | Affected gate: BA_FEASIBILITY, ARCHITECTURE | Ngưỡng lệch (BR-009) giữa ledger và Binance để coi là "drift thật" (so với rounding/dust) là bao nhiêu? Chưa có số, không tự chọn.
- OQ-C02 | Owner: BA | Affected gate: ARCHITECTURE | Cơ chế concurrency control cho event cùng Borrow Position (optimistic lock/DB transaction) — cần BA + architect xác nhận khớp pattern Prisma đã dùng ở các feature trước (xem docs/DATABASE.md).
- Risk: MVP dựa hoàn toàn vào user tự nhập sự kiện đúng thời điểm; nếu user quên ghi hoặc nhập sai số (ví dụ proceeds thực nhận), ledger sẽ sai mà reconciliation chỉ phát hiện được phần có thể so sánh với Binance (liability/borrowed asset), không phát hiện được sai lệch nội bộ giữa các lot. Residual risk cần user chấp nhận và được cảnh báo rõ trong UX (US-006 chỉ phát hiện lệch so với Binance, không đảm bảo lot-level accuracy).
- Dependency: cần `binance-read-only-connection` cung cấp đúng liability/borrowed asset field đã verify (BR-007/BR-009 của `binance-read-only-connection`, xem OQ-R01 trong `requirements/binance-read-only-connection.md`) — nếu field đó đổi, reconciliation của feature này phải re-verify.

## Handoff checklist
- AC-001..AC-010 trace tới BR-001..BR-010; mục NEEDS_VERIFICATION (BR-007, BR-009) và OPEN_QUESTION (OQ-P05, OQ-C01, OQ-C02) đã nêu rõ owner và gate bị chặn, không tự chốt.
- 4 quyết định MVP-scoping (mixed-source chặn, reserve 100% tới REPAID, chỉ BTC/ETH, 1 Borrow Position/asset) đã được user chốt ngày 2026-10-01 (ghi trong Business rules là "quyết định nghiệp vụ đã chốt", không phải giả định mới của agent này).
- Scope đủ cho BA feasibility: BA cần đánh giá OQ-P05/OQ-C01/OQ-C02 trước khi architecture chốt schema/concurrency; nếu BA thấy mức "phát hiện + chặn thủ công" cho OQ-P05 chưa đủ an toàn, phải BLOCKED và quay lại requirement.
- Đề xuất requirement_status: READY (đủ để BA feasibility review). Không tự duyệt BA.
