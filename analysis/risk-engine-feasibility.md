# BA feasibility: risk-engine

Requirement revision: r1-2026-10-02 (sha256:d5595012384086a5a722284b5a7f236ecac6d27a0f9e75c9e2d9d9ce3147015e) | Owner: ba-feasibility-agent
Decision: features/risk-engine/decision.json
Status: APPROVED_WITH_CONDITIONS

## Scope và assumption challenge
Requirement đã loại bỏ đúng 2 trục chính sách chưa chốt (nguồn `current_price`, định nghĩa collateral) bằng 2 quyết định scoping user chốt trực tiếp (2026-10-02) thay vì tự chọn — khớp AGENTS.md. Challenge các assumption còn lại:

- "Initial exposure = `quantity` × `first_borrow_entry_price`, không có OPEN_QUESTION cộng khoản vay bổ sung" (BR-005): đã kiểm tra `architecture/capital-provenance-ledger.md` — ledger hiện chỉ có `BORROW_OPENED` khi chưa có position OPEN cùng asset (unique index `WHERE status='OPEN'`), không có event "vay thêm vào position đang mở". Assumption đúng, không có cách nào trong hệ thống hiện tại tạo ra trường hợp phải cộng dồn nhiều lần vay vào 1 exposure. Giữ nguyên.
- "Buyback cost = `liabilityLedger` × current_price" (BR-009): đã kiểm tra field `liabilityLedger` trong `BorrowPosition` (architecture/capital-provenance-ledger.md dòng ~59) — đúng là "principal+interest, đơn vị borrowedAsset, cập nhật qua REPAY event", khác `quantity` (không đổi sau khi tạo). Dùng `liabilityLedger` là đúng field outstanding, không phải `quantity` gốc. Assumption đã sửa đúng trong requirement, feasible.
- "Collateral proxy = `totalCollateralValueInUSDT`" (BR-006): đã kiểm tra trực tiếp `backend/src/binance-adapter/binance-api.types.ts` (code thật của `binance-read-only-connection`, không chỉ tài liệu) — field `totalCollateralValueInUSDT` tồn tại ở top-level `CrossMarginAccountResponse`, cùng cấp với `totalNetAssetOfBtc`, đã được Binance tính sẵn bằng USDT (không cần quy đổi giá BTC). Đây là field đúng nghĩa "collateral value" nhất trong response, chính xác hơn phương án ban đầu của requirement (lấy riêng `netAsset` của dòng USDT trong `userAssets`, vốn chỉ là free+locked−borrowed của 1 asset, không phải giá trị collateral toàn tài khoản) — ghi nhận đây là gap phát hiện khi BA rà lại requirement, đã sửa trực tiếp vào `requirements/risk-engine.md` trước khi APPROVED (coordinator action, không phải tự ý đổi scope). Field vẫn NEEDS_VERIFICATION về định dạng số thực tế (kế thừa EV-001 gốc).
- "R1 chỉ là cảnh báo thông tin, không chặn gì" (Non-goals): đúng với thực tế hệ thống chưa có Binance Execution — không phát hiện gap.
- "Không có mức cảnh báo trung gian ngoài R2 2× boundary" (BR-002): đúng theo docs/RISK_RULES.md chỉ định nghĩa 1 ngưỡng — không tự thêm tier, giữ nguyên.

Không phát hiện assumption nào về Binance API behavior **mới** cần verify — mọi field dùng lại đúng field đã verify ở `binance-read-only-connection` (EV-001 của feature đó) và field đã có trong architecture READY của `capital-provenance-ledger`.

## Evidence register
Không có claim API Binance mới. Feature tái dùng field đã verify ở `analysis/binance-read-only-connection-feasibility.md` (EV-001) và field đã thiết kế ở `architecture/capital-provenance-ledger.md`.

| ID | Claim / exact API behavior | Official URL + section | Checked at | Account scope | Evidence / limitations | Status |
|---|---|---|---|---|---|---|
| EV-001 | `GET /sapi/v1/margin/account` trả top-level `totalCollateralValueInUSDT` (string, đã quy đổi USDT bởi Binance) cùng cấp với `totalNetAssetOfBtc`, `marginLevel`; đã implement trong `backend/src/binance-adapter/binance-api.types.ts` (`CrossMarginAccountResponse`) của `binance-read-only-connection` | https://developers.binance.com/docs/margin_trading/account/Query-Cross-Margin-Account-Details (tái dùng, đã verify 2026-09-29 tại `analysis/binance-read-only-connection-feasibility.md` EV-001) + đọc trực tiếp code implement thật 2026-10-02 | 2026-09-29 (UTC, tài liệu) / 2026-10-02 (code) | Binance.com, Cross Margin | Chưa test bằng key thật (không có Margin testnet — EV-004 của feature nguồn); định dạng số chính xác (string) vẫn NEEDS_VERIFICATION ở feature nguồn, risk-engine kế thừa nguyên trạng, không re-verify lại | DEPENDENCY_INHERITED (NEEDS_VERIFICATION ở phần định dạng số, kế thừa từ `binance-read-only-connection`) |
| EV-002 | `BorrowPosition.liabilityLedger` (principal+interest, đơn vị borrowedAsset, cập nhật qua REPAY) và `BorrowPosition.quantity` (immutable, không đổi theo REPAY) là 2 field riêng biệt đã thiết kế trong `architecture/capital-provenance-ledger.md`, không phải field mới | N/A — đọc trực tiếp architecture đã READY của feature phụ thuộc | 2026-10-02 | N/A (internal schema) | `architecture/capital-provenance-ledger.md` architecture_status=READY, nhưng feature đó mới ở stage QA (PASS_WITH_WARNINGS), chưa DONE — nếu schema đổi sau, risk-engine phải re-verify (xem Dependency risk) | DEPENDENCY_INHERITED |

Ghi chú: EV-001 là tái sử dụng evidence đã verify ở feature khác (không fetch lại docs Binance lần 2 cho cùng field — tránh verify trùng không cần thiết), bổ sung bằng việc đọc trực tiếp type definition thật trong code (`binance-api.types.ts`) để xác nhận field `totalCollateralValueInUSDT` tồn tại đúng như tài liệu, vì `binance-read-only-connection` chỉ pass-through hiển thị, chưa cần diễn giải ngữ nghĩa field này chi tiết.

## Financial feasibility
- Units: USDT cho exposure/cap/collateral/buyback cost, Decimal — khớp AGENTS.md. Không phát hiện vi phạm.
- BR-002 (R2 boundary `>=`) feasible, phép so sánh đơn giản, không cần derive.
- BR-005 (initial exposure = Σ quantity × firstBorrowEntryPrice của mọi OPEN position) feasible, dùng field có sẵn, không cần Binance call mới.
- BR-006/BR-007 (collateral proxy / cap) feasible với **condition mới** (xem Decision) về label UI rõ nghĩa `totalCollateralValueInUSDT` (không phải tổng mọi tài sản, mà là giá trị Binance tự tính cho mục đích collateral) như phân tích trên, và case "chưa có connection VERIFIED" (không phải "field = 0") đã được requirement xử lý đúng (AC-007: hiển thị "chưa xác định", không coi = 0).
- BR-009 (buyback cost = liabilityLedger × current_price) feasible, field đã verify đúng ngữ nghĩa (EV-002).
- Worked example kiểm tra conservation: Borrow Position ZEC, quantity vay = 100 ZEC, firstBorrowEntryPrice = 50 USDT → initial exposure = 5,000 USDT. Giả sử đã repay một phần, liabilityLedger hiện = 60 ZEC. User nhập current_price = 110 (>= 2×50) → CRITICAL_REPAY_REQUIRED, buyback cost ước tính = 60 × 110 = 6,600 USDT. Số học nhất quán, không dùng `quantity` (100) gây overestimate sai so với liability thực còn nợ (60) — xác nhận lại lý do BR-009 sửa đúng hướng.
- Rounding cap (BR-007, chia 3): không cần policy rounding riêng vì đây chỉ là so sánh hiển thị (>, ==, <), không ảnh hưởng số lưu trữ; hiển thị đủ chữ số thập phân là đủ, không cần BA quyết thêm.

## Trace AC → feasibility
| AC | Feasible? | Note |
|---|---|---|
| AC-001, AC-002, AC-003 | Feasible | Phép so sánh Decimal đơn giản, dùng field có sẵn |
| AC-004 | Feasible | Chỉ là UI label, không có tính toán mới |
| AC-005, AC-006 | Feasible | Tổng hợp nhiều Borrow Position, field đã có |
| AC-007 | Feasible | Đã xử lý case không có connection VERIFIED, không mặc định collateral = 0 ngầm |
| AC-008 | Feasible | Ownership scoping pattern đã áp dụng ở các feature trước, tái dùng |
| AC-009 | Feasible | Lọc theo status=OPEN, field có sẵn |
| AC-010 | Feasible | Chỉ cần state "chưa kiểm tra" riêng biệt với OK/CRITICAL, không có rủi ro tính toán |

## Decision: APPROVED_WITH_CONDITIONS
Requirement khả thi kỹ thuật và tài chính, dùng lại field/evidence đã verify ở 2 feature phụ thuộc, không cần Binance API call mới. Không có blocker cứng, nhưng 2 condition bắt buộc trước ARCHITECTURE READY:

- COND-001 | Owner: architect-agent | due_gate: ARCHITECTURE | UI/API response label cho collateral proxy phải ghi rõ "Collateral value (USDT) — theo Binance `totalCollateralValueInUSDT`, ước lượng chưa verify bằng API thật" — tránh user hiểu nhầm đây là giá trị đã được sản phẩm verify/haircut độc lập (xem Scope assumption challenge, BR-006).
- COND-002 | Owner: architect-agent + coordinator | due_gate: ARCHITECTURE | Vì `capital-provenance-ledger` (nguồn field `liabilityLedger`, `quantity`, `firstBorrowEntryPrice`) mới ở stage QA PASS_WITH_WARNINGS (chưa DONE), architecture của risk-engine phải tham chiếu đúng revision hiện tại của schema đó và ghi rõ: nếu `capital-provenance-ledger` đổi schema sau (ví dụ do warning QA được xử lý dẫn tới migration), risk-engine phải được re-verify theo quy tắc invalidation ở `workflows/feature-development.md`.
- COND-003 | Owner: architect-agent | due_gate: ARCHITECTURE | Khi user có nhiều Binance connection VERIFIED, architecture phải chọn 1 quy tắc xác định (ví dụ `lastVerifiedAt` gần nhất) làm nguồn collateral duy nhất, ghi rõ đây là lựa chọn kỹ thuật tạm (OQ-RE03), không phải policy đã duyệt, và không được âm thầm cộng dồn nhiều account.

Open questions kế thừa từ requirement (OQ-RE01, OQ-RE02) giữ nguyên OPEN, không chặn ARCHITECTURE (đã accept risk ở decision.json theo quyết định user 2026-10-02).

## Risks
- RISK-001 (kế thừa từ `binance-read-only-connection`): không có Margin sandbox chính thức → mọi test tự động dùng mocked fixture dựng từ tài liệu (EV-001), không phải real API đã verify end-to-end. Residual risk đã được accept ở feature nguồn; risk-engine kế thừa, không tạo rủi ro mới nhưng cần nêu lại trong QA plan của chính feature này.
- RISK-002 (mới, giảm nhẹ hơn sau khi đổi field): collateral proxy (`totalCollateralValueInUSDT`) đã là field Binance tự tính cho mục đích collateral (bao gồm toàn bộ tài sản margin account, không chỉ USDT) nên rủi ro "bỏ sót tài sản khác" giảm đáng kể so với phương án `netAsset` ban đầu. Rủi ro còn lại: công thức/haircut nội bộ của Binance cho field này không được app tự kiểm chứng độc lập (NEEDS_VERIFICATION định dạng số, EV-001), và sản phẩm chưa có haircut riêng. User đã accept risk này cho MVP — khuyến nghị UI nhắc lại disclaimer mỗi lần hiển thị cap (đã có BR-006, COND-001 nhấn mạnh thêm).
- RISK-003 (mới): nếu user có nhiều Binance connection VERIFIED, MVP chỉ dùng 1 connection (`lastVerifiedAt` gần nhất — xem requirement Edge cases, OQ-RE03) làm nguồn collateral, có thể bỏ sót collateral ở account khác nếu user thực sự dùng nhiều account. Đây là lựa chọn kỹ thuật tạm, chưa phải policy đã duyệt — ghi OQ-RE03, không chặn ARCHITECTURE vì OQ-R03 gốc (nhiều connection) cũng đang OPEN và chưa ảnh hưởng invariant an toàn (chỉ ảnh hưởng độ đầy đủ của cảnh báo thông tin R1).
