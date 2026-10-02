# BA feasibility: capital-provenance-ledger

Requirement revision: r1-2026-10-01 (sha256:429b97a572705c75a7570e44054961ab5b8841cd554bc884e8e64760c07db5e6) | Owner: ba-feasibility-agent
Decision: features/capital-provenance-ledger/decision.json
Status: APPROVED_WITH_CONDITIONS

## Scope và assumption challenge
Requirement thu hẹp đúng hướng: loại bỏ 4 trục chính sách chưa chốt (mixed-source, proceeds release, SOL, debt aggregation) bằng cách giới hạn MVP thay vì tự chọn policy — khớp AGENTS.md. Challenge các assumption còn lại:

- "User tự ghi nhận event" (không tự động từ Binance trade history): hợp lý vì `Binance Execution` chưa tồn tại (NOT_STARTED) và chưa có cơ chế đọc trade history chi tiết đã verify trong `binance-read-only-connection` (requirement đó chỉ liệt kê "danh sách margin open orders/trade history ở mức tối thiểu", chưa phải full trade feed). Không có cách nào khác khả thi cho MVP — assumption được giữ.
- "1 Borrow Position OPEN/asset/user": loại bỏ đúng bài toán phân bổ interest/repay giữa nhiều position cùng asset (OQ-P04) nhưng tạo giới hạn thực tế: user **không thể** vay thêm cùng asset để tăng vị thế khi đang có vay OPEN, kể cả khi đó là hành vi hợp lệ trên Binance. Đây là trade-off đã được user chấp nhận khi chọn phương án MVP — ghi nhận là giới hạn sản phẩm, không phải bug, nhưng UI cần nói rõ lý do (không chỉ "reject" trống).
- "Reserve 100% tới REPAID" (BR-005/BR-006): an toàn hơn phương án liability-cap vì không cần ước tính interest tương lai — đúng nguyên tắc AGENTS.md "Không giải phóng reserved khi buyback/repay mới submitted hoặc timeout" áp dụng tương tự (thận trọng > tối ưu vốn). Chấp nhận được cho MVP.
- Requirement giả định reconciliation (BR-009) có "ngưỡng lệch" nhưng chưa có giá trị — đây là OQ-C01, xử lý ở Decision.

Không phát hiện assumption nào về Binance API behavior cụ thể cần verify mới trong feature này: toàn bộ dữ liệu Binance dùng lại field đã/đang được `binance-read-only-connection` cung cấp (liability, borrowed asset outstanding). Không có Evidence register API mới — xem mục dưới.

## Evidence register
Không có claim API Binance mới trong feature này. Feature phụ thuộc field đã nêu ở `requirements/binance-read-only-connection.md` (BR-005/BR-007, OQ-R01) — các field đó đang ở trạng thái NEEDS_VERIFICATION/QA PASS_WITH_WARNINGS tại feature nguồn, chưa phải APPROVED tuyệt đối. Ghi nhận phụ thuộc, không lặp lại verification ở đây.

| ID | Claim / exact API behavior | Official URL + section | Checked at | Account scope | Evidence / limitations | Status |
|---|---|---|---|---|---|---|
| EV-001 | Liability/borrowed asset dùng để reconciliation (BR-009) là field đã implement tại `binance-read-only-connection` (không phải call Binance mới) | N/A — tái dùng adapter nội bộ | N/A | Cross Margin Classic (đã chốt ở feature nguồn) | `qa/binance-read-only-connection.md` (PASS_WITH_WARNINGS); nếu field đó sai, drift detection của feature này sẽ sai theo — rủi ro kế thừa, không phải rủi ro mới | DEPENDENCY_INHERITED |

## Financial feasibility
- Units: USDT cho proceeds/reserved/liability, native unit (BTC/ETH quantity) cho lot — khớp Decimal/explicit-unit requirement của AGENTS.md. Không phát hiện vi phạm.
- Công thức BR-005 (reserve = 100% proceeds thực nhận của phần bán) là phép cộng đơn giản, không cần derive thêm — feasible.
- Công thức BR-006 (release = reservedAmount khi liability = 0) feasible với điều kiện: liability "= 0" phải dựa trên số user nhập hoặc Binance trả, làm tròn theo BR-007 (NEEDS_VERIFICATION rounding) — ví dụ liability còn 0.00000001 BTC do rounding có thể không bao giờ "đúng bằng 0". Đây là gap mới phát hiện, thêm vào Decision làm condition.
- Ví dụ worked case (từ requirement AC-005/AC-006): Borrow 10,000 USDT → sell → buy lot cost 6,000 USDT (BTC) + để lại 4,000 USDT không dùng (không thuộc lot). Bán 50% lot proceeds 3,500 → reserved 3,500. Repay hết 10,000 (giả định không interest cho ví dụ) → release 3,500 thành free capital. Số học nhất quán, không phát hiện mâu thuẫn conservation-of-units.
- 2× rule (current_price ≥ 2× first_borrow_entry_price → CRITICAL_REPAY_REQUIRED) **không** thuộc scope feature này (đó là Risk Engine/Alert Engine, dùng `first_borrow_entry_price` do ledger này lưu làm input) — xác nhận requirement không tự mở rộng sang tính năng đó. Đúng.
- Exposure ≤ collateral/3: feature này không tính/enforce invariant đó (không có Binance Execution để chặn borrow) — chỉ lưu `first_borrow_entry_price`/quantity làm input cho Risk Engine sau này. Xác nhận requirement không tự nhận trách nhiệm enforce — đúng, nhưng cần ghi rõ trong README/docs để Risk Engine sau này biết lấy input từ đâu (đã có ở docs/DOMAIN.md bảng module).

## Provenance analysis
4 quyết định MVP-scoping (mixed-source, proceeds release, SOL, debt aggregation) đã được user chốt trực tiếp (ghi trong requirement Business rules + decision.json history 2026-10-01) — BA không cần re-litigate, chỉ xác nhận tính nhất quán:
- Chặn mixed-source (BR-003) nhất quán với 1-position/asset (BR-002): vì chỉ có 1 Borrow Position OPEN/asset, "chọn nguồn = 1 Borrow Position cụ thể" không bị ambiguous bởi nhiều position cùng asset cùng lúc. Nhất quán.
- Loại SOL (BR-004) nhất quán với docs/DOMAIN.md (SOL invariant là OPEN_QUESTION riêng, chưa có default). Nhất quán.
- External/unattributed activity (BR-009, Edge cases): requirement chọn "phát hiện + quarantine + chặn hành động phụ thuộc", đúng tinh thần docs/CAPITAL_PROVENANCE.md ("không mặc định personal capital"). Chấp nhận được.

OQ-P05 (fee token khác, dust, partial repay vượt/thiếu, external transfer): requirement đã hạ xuống mức tối thiểu an toàn (detect + block automation, user tự xử lý thủ công ngoài hệ thống hoặc qua correction event thủ công). BA đánh giá: **đủ an toàn cho MVP** vì không có tính toán tự động nào dựa trên giả định chưa verify (không vi phạm "Không reserve dựa trên notional giả định khi fill khác preview"). Không BLOCKED, nhưng cần condition rằng UI phải hiển thị rõ các case này là "cần xử lý thủ công", không im lặng — đã có trong requirement Edge cases, BA xác nhận giữ nguyên ở ARCHITECTURE/DESIGN.

## API/security/operational feasibility
- Permissions/ownership: tái dùng pattern `req.user.id` từ session (đã APPROVED ở `user-authentication`) — feasible, không phát sinh thiết kế mới.
- Idempotency: ghi nhận event là thao tác nội bộ (không gọi Binance write) nên không có rủi ro double-submit tới exchange; rủi ro duy nhất là double-submit tạo 2 event trùng trong ledger nội bộ (double counting) — architecture phải có idempotency key hoặc xác nhận UI chặn double-click, ghi làm condition.
- Timeout reconciliation: requirement đã xử lý đúng (AC "chưa đối chiếu được" khác "đã đối chiếu, khớp") — feasible, khớp AGENTS.md.
- Test environment: không cần Binance sandbox (không gọi Binance mới); test chỉ cần fixture dữ liệu đọc từ `binance-read-only-connection` interface nội bộ — feasible, rủi ro thấp hơn hẳn feature đó.
- Mode separation (READ_ONLY/PAPER_TRADING/LIVE): requirement xác nhận không phân biệt mode vì không execute — chấp nhận được vì ledger chỉ là nhật ký nội bộ.

## AC coverage và missing cases
- AC-001..AC-010: đều feasible với thiết kế append-only + status machine (OPEN/REPAID/DRIFT_DETECTED) đơn giản, không cần Binance call mới. Không có AC nào "not feasible".
- Missing case phát hiện thêm (không có trong requirement gốc): **liability "= 0" với rounding dust** (xem Financial feasibility) — thêm AC-011 đề xuất cho ARCHITECTURE: "Given liability còn lại nhỏ hơn ngưỡng dust đã cấu hình (không phải đúng 0), When user ghi REPAY cuối, Then hệ thống cho phép đóng REPAID và ghi rõ phần dust bị bỏ qua (không được tự coi là lãi/lỗ)." — liên quan OQ-P05, gộp vào condition.
- Missing case: double-submit cùng 1 event (idempotency) — thêm vào condition ARCHITECTURE thay vì sửa requirement (không đổi AC, chỉ là non-functional, theo workflow "chỉ sửa editorial không tác động có thể giữ approval" — đây không editorial nên BA thêm làm condition cho ARCHITECTURE, không tự sửa requirement.md).

## Decision
APPROVED_WITH_CONDITIONS. Không BLOCKED vì không còn unknown critical behavior ảnh hưởng an toàn tài chính chưa có hướng xử lý (mọi case chưa chốt đều được requirement hạ xuống "phát hiện + chặn + xử lý thủ công", không tự tính sai).

Conditions:
- COND-001 | Owner: BA + user | Affected gate: ARCHITECTURE | Due gate: ARCHITECTURE | OQ-C01: xác định giá trị ngưỡng lệch (dust vs drift thật) dùng chung cho BR-009 và dust-on-repay (AC-011 đề xuất). Architecture không được tự chọn con số; có thể thiết kế threshold configurable, nhưng giá trị mặc định/cách xác định phải có nguồn (user hoặc BA) trước khi ARCHITECTURE coi là READY áp dụng threshold đó vào schema/logic.
- COND-002 | Owner: architect | Affected gate: ARCHITECTURE | Due gate: ARCHITECTURE | Idempotency cho việc ghi nhận event (double-submit) phải có cơ chế rõ ràng (idempotency key hoặc unique constraint + UI chặn double-click) trước khi ARCHITECTURE READY — đây là quyết định kỹ thuật, không phải chính sách nghiệp vụ, architect tự quyết nhưng phải ghi rõ trong architecture.md.
- COND-003 | Owner: architect | Affected gate: ARCHITECTURE | Due gate: ARCHITECTURE | Concurrency control cho event cùng Borrow Position (OQ-C02 trong requirement) là quyết định kỹ thuật (optimistic lock/DB transaction), không cần user/BA quyết thêm — architect chọn và ghi rõ cơ chế, khớp pattern Prisma hiện có trong `docs/DATABASE.md`. Đánh dấu OQ-C02 RESOLVED ở mức BA (chuyển giao cho architecture như một task, không còn là open question chờ người khác quyết).
- COND-004 | Owner: BA + architect | Affected gate: ARCHITECTURE | Due gate: IMPLEMENTATION | OQ-P05: giữ nguyên mức "detect + block + manual" của requirement cho MVP; ARCHITECTURE phải thiết kế rõ trạng thái/field lưu các case này (fee-token-khác, dust, overpayment, external-transfer) là "cần user xử lý thủ công", không được âm thầm bỏ field hoặc tự tính. Review/QA phải kiểm tra có đúng chặn tự động hoá cho các case này không.

Không có blocker. Risk RISK-001 (ledger phụ thuộc user tự nhập đúng) giữ nguyên trong decision.json, chưa cần ACCEPTED chính thức tới khi DESIGN làm rõ cách UI cảnh báo giới hạn này cho user.

Đề xuất ba_status: APPROVED_WITH_CONDITIONS (COND-001..COND-004, due_gate ARCHITECTURE/IMPLEMENTATION như trên). Không tự duyệt ARCHITECTURE; coordinator ghi decision.json sau khi đối chiếu.
