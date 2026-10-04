# Requirement: risk-engine

Revision: r1-2026-10-02 | Owner: product-requirement-agent | Decision: features/risk-engine/decision.json

## Problem, user và outcome
Sau `capital-provenance-ledger`, hệ thống đã biết mỗi Borrow Position (asset vay, quantity, `first_borrow_entry_price` immutable, liability hiện tại) và `binance-read-only-connection` đã đọc được balance margin account. Nhưng chưa có nơi nào **tính và hiển thị** 2 cảnh báo rủi ro bắt buộc theo `docs/RISK_RULES.md`: (R1) tổng initial borrow exposure có vượt cap = verified USDT collateral / 3 không, và (R2) giá hiện tại của asset đã vay có chạm ngưỡng 2× first entry price (CRITICAL_REPAY_REQUIRED) không. Thiếu Risk Engine, user phải tự tính tay, dễ bỏ lỡ thời điểm phải chuẩn bị repay.

User: cá nhân user đã đăng nhập, đã kết nối Binance (`binance-read-only-connection`), đang dùng `capital-provenance-ledger` để tự ghi nhận Borrow Position. User chủ động xem trạng thái risk, không có polling/alert tự động nền trong MVP này.

Outcome đo được:
- User xem được, cho mỗi Borrow Position đang OPEN: exposure ban đầu (quantity × `first_borrow_entry_price`), liability hiện tại, và trạng thái risk R2 sau khi tự nhập `current_price`.
- Khi `current_price >= first_borrow_entry_price × 2` cho một Borrow Position, hệ thống hiển thị rõ `CRITICAL_REPAY_REQUIRED` kèm principal/interest/liability và ước tính USDT cần để buyback+repay; không tự đặt lệnh, không tự thực hiện bất kỳ hành động nào.
- User xem được tổng initial borrow exposure của toàn bộ Borrow Position đang OPEN so với cap = collateral proxy / 3, và biết ngay khi đã vượt cap — ở dạng cảnh báo thông tin (hệ thống chưa có chức năng tự vay nên không có gì để "chặn"; xem Scope).
- Mọi số liệu hiển thị kèm rõ: input nào do user tự nhập (current_price, collateral) và input nào đọc từ Binance/ledger, để user không nhầm số liệu ước tính với số liệu đã verify.

Không phải risk engine tổng quát cho mọi loại rủi ro thị trường; không dự đoán giá; không tự thực thi repay/buy/sell; không phải Alert Engine (chưa có polling/notification nền — đó là scope riêng nếu làm sau).

## Scope / MVP / non-goals
In-scope (MVP):
- **R2 — 2× first entry check**: cho mỗi Borrow Position OPEN (đọc từ `capital-provenance-ledger`), user tự nhập `current_price` (giá hiện tại của asset đã vay, đơn vị USDT) tại thời điểm muốn kiểm tra (không có feed giá tự động trong feature này — xem quyết định scoping dưới). Hệ thống tính `current_price >= first_borrow_entry_price × 2` → `CRITICAL_REPAY_REQUIRED`; ngược lại → `OK`. Không có mức cảnh báo trung gian (ví dụ 1.5×) trong MVP — RISK_RULES.md chỉ định nghĩa đúng 1 ngưỡng, không tự thêm tier.
- Khi `CRITICAL_REPAY_REQUIRED`: hiển thị principal, interest, liability hiện tại (từ ledger/Binance theo field đã có), ước tính USDT cần mua lại đúng `liabilityLedger` (outstanding borrowed asset, xem BR-009) tại `current_price` user vừa nhập (buyback cost ước tính), để user tự chuẩn bị repay plan. Không tạo order, không gọi Binance write endpoint.
- **R1 — Borrow cap check**: tổng initial exposure = Σ (quantity × `first_borrow_entry_price`) của **mọi Borrow Position đang OPEN của user** (đơn vị USDT, theo đúng định nghĩa "Initial exposure" trong `docs/DOMAIN.md`). Hệ thống hiện chưa có khoản vay bổ sung vào 1 Borrow Position đã mở (ledger chỉ có `BORROW_OPENED` khi chưa có position OPEN cùng asset — xem BR-002 của `capital-provenance-ledger`), nên initial exposure mỗi position là giá trị cố định tại thời điểm `BORROW_OPENED`, không có OPEN_QUESTION "cộng khoản vay bổ sung" cần giải quyết ở MVP này.
- Collateral dùng cho cap = **`totalCollateralValueInUSDT`** — field trả về nguyên văn bởi `GET /sapi/v1/margin/account` (đã có sẵn trong response mà `binance-read-only-connection` đọc, cùng cấp với `totalNetAssetOfBtc`, không cần quy đổi qua giá BTC vì field này Binance đã tính sẵn bằng USDT). Đây là quyết định scoping MVP của user (2026-10-02 — "dùng tổng USDT-equivalent balance thô từ Binance"); field này khớp đúng nghĩa đó hơn so với lựa chọn ban đầu (chỉ lấy dòng `netAsset` của riêng USDT trong `userAssets`, bị phát hiện là lựa chọn kém chính xác hơn khi architecture rà lại response thật — xem architecture/risk-engine.md). Không áp haircut/account-scope bổ sung nào ngoài giá trị Binance trả về; field này vẫn NEEDS_VERIFICATION về định dạng số thực tế theo `docs/BINANCE_INTEGRATION.md` (kế thừa từ `binance-read-only-connection`). Mọi nơi hiển thị số này phải ghi rõ label "Collateral value (USDT, theo Binance `totalCollateralValueInUSDT`) — ước lượng, chưa verify bằng API thật" — không gọi tắt là "collateral" không kèm disclaimer.
- Cap = collateral proxy ở trên / 3. Khi tổng initial exposure > cap: hiển thị cảnh báo `OVER_BORROW_CAP` (so sánh, không chặn hành động — xem Non-goals). Bằng cap: không cảnh báo (đúng theo R1 "Bằng cap được phép qua riêng gate này").
- Risk check là on-demand (user trigger hoặc load trang), không có background job/scheduler trong MVP này.
- Toàn bộ số tiền/giá dùng Decimal, ghi rõ unit; không dùng float.

Out-of-scope / non-goals (feature khác hoặc v2, không tự mở rộng):
- Không tự động lấy `current_price` từ Binance ticker hoặc nguồn giá nào khác — quyết định scoping của user (2026-10-02): MVP chỉ nhận giá do user tự nhập mỗi lần check. Market Data module (nguồn giá tự động) là feature riêng, NOT_STARTED; khi feature đó có, risk-engine có thể tích hợp lại nhưng đó là thay đổi scope cần BA lại.
- Không có gì để "chặn" khi vượt cap R1 vì hệ thống chưa có chức năng tự vay (Binance Execution NOT_STARTED, user tự vay trực tiếp trên Binance). R1 trong feature này là **cảnh báo thông tin**, không phải gate thực thi. Khi Binance Execution được xây, enforcement thực sự của R1 là trách nhiệm của feature đó (dùng lại phép tính này), không phải risk-engine tự thêm action.
- Không polling/alert nền tự động (Alert Engine là feature riêng, phụ thuộc risk-engine này theo `docs/DOMAIN.md` nhưng chưa làm).
- Không tính Profit & Repay Calculator đầy đủ (net executable liquidation value, slippage, fee mua lại thực tế) — MVP R2 chỉ ước tính buyback cost đơn giản = `liabilityLedger` × current_price (xem BR-009), ghi rõ "ước tính, chưa trừ fee/slippage thực tế mua lại". Calculator chi tiết là feature khác dùng ledger + risk-engine làm input.
- Không áp dụng cho SOL (ngoài scope invariant BTC/ETH theo AGENTS.md) — nhưng R1/R2 trong tài liệu này áp dụng cho **borrowed asset** (asset bị vay, có thể là altcoin bất kỳ theo domain: "USDT collateral → borrow altcoin"), không phải BTC/ETH/SOL allocation; không nhầm 2 khái niệm.
- Không sửa/xóa Borrow Position hoặc ledger event — risk-engine chỉ đọc (read-only) từ `capital-provenance-ledger` và `binance-read-only-connection`, không viết ngược.

Dependencies: `capital-provenance-ledger` (Borrow Position: asset, quantity, `first_borrow_entry_price`, liability, status — QA PASS_WITH_WARNINGS), `binance-read-only-connection` (margin account snapshot, field `totalCollateralValueInUSDT` — QA PASS_WITH_WARNINGS), `user-authentication` (ownership per-user — QA PASS_WITH_WARNINGS).

READ_ONLY/PAPER_TRADING/LIVE: feature này không gọi Binance write endpoint nào, không thực thi hành động nào; áp dụng như nhau cho mọi mode vì chỉ đọc + tính toán + hiển thị.

## User stories
- US-001: Là user, tôi muốn nhập giá hiện tại của asset tôi đã vay, để biết ngay Borrow Position đó có chạm ngưỡng CRITICAL_REPAY_REQUIRED (2× giá vay đầu tiên) không.
- US-002: Là user, khi một Borrow Position chạm CRITICAL_REPAY_REQUIRED, tôi muốn thấy rõ principal/interest/liability và ước tính USDT cần để mua lại + trả nợ, để tôi tự chuẩn bị.
- US-003: Là user, tôi muốn xem tổng initial exposure của mọi khoản vay đang mở so với cap (collateral/3), để biết tôi đang vay gần/sát/vượt giới hạn an toàn khuyến nghị.
- US-004: Là user, tôi muốn phân biệt rõ số nào tôi tự nhập (giá hiện tại, hoặc collateral nếu áp dụng) và số nào hệ thống đọc từ Binance/ledger, để không nhầm số ước tính với số đã xác minh.
- US-005: Là user, tôi không muốn thấy Borrow Position hoặc risk status của user khác.

## Business rules
| ID | Rule + units | Source | Verification / question |
|---|---|---|---|
| BR-001 | Risk check thuộc về đúng 1 user; chỉ đọc Borrow Position và balance của user đang đăng nhập. | `user-authentication`, `binance-read-only-connection`, `capital-provenance-ledger` (đã áp dụng) | Verified |
| BR-002 | R2: `current_price >= first_borrow_entry_price × 2` → `CRITICAL_REPAY_REQUIRED`; `current_price < first_borrow_entry_price × 2` → `OK`. Test đúng dưới/bằng/trên boundary. | docs/RISK_RULES.md (R2) | Verified (rule đã chốt, boundary dùng `>=`) |
| BR-003 | `current_price` là input user tự nhập mỗi lần risk check, không lưu như một "giá thị trường chính thức", không dùng lại cho lần check khác nếu user không nhập lại. | Quyết định scoping user 2026-10-02 | Verified (quyết định đã chốt) |
| BR-004 | `first_borrow_entry_price` đọc từ Borrow Position của `capital-provenance-ledger`, immutable; risk-engine không tự tính hoặc cho sửa giá trị này. | docs/DOMAIN.md, BR-001 của `capital-provenance-ledger` | Verified |
| BR-005 | Initial exposure của 1 Borrow Position = `quantity` (tại thời điểm `BORROW_OPENED`) × `first_borrow_entry_price`, đơn vị USDT. Tổng initial exposure = tổng của mọi Borrow Position đang OPEN thuộc user. | docs/DOMAIN.md ("Initial exposure") | Verified cho MVP (không có cơ chế vay bổ sung vào 1 position hiện tại — xem Scope) |
| BR-006 | Collateral proxy cho R1 = `totalCollateralValueInUSDT` của margin account snapshot (`binance-read-only-connection`). Nếu user không có connection nào ở trạng thái VERIFIED (chưa kết nối Binance hoặc chưa verify), coi collateral là "chưa xác định" (không phải 0) và cảnh báo rõ "chưa kết nối/verify Binance, không thể tính cap" — khác với trường hợp field trả về đúng là 0. | Quyết định scoping user 2026-10-02 | NEEDS_VERIFICATION (field `totalCollateralValueInUSDT` của `/sapi/v1/margin/account` chưa được BA xác minh bằng evidence thật — đã NEEDS_VERIFICATION từ `binance-read-only-connection`, risk-engine kế thừa, không tự xác minh lại) |
| BR-007 | Cap R1 = collateral proxy (BR-006) / 3. Tổng initial exposure (BR-005) > cap → `OVER_BORROW_CAP`; == cap → không cảnh báo; < cap → không cảnh báo. | docs/RISK_RULES.md (R1) | Verified (công thức đã chốt; áp dụng trên proxy collateral chưa phải giá trị verify đầy đủ — xem BR-006) |
| BR-008 | `OVER_BORROW_CAP` và `CRITICAL_REPAY_REQUIRED` là cảnh báo hiển thị, không kích hoạt hành động tự động nào (không tạo order, không khóa tài khoản, không gửi notification nền). | AGENTS.md ("Không dùng alert hoặc score để tự thực thi") | Verified |
| BR-009 | Ước tính buyback cost khi `CRITICAL_REPAY_REQUIRED` = `liabilityLedger` (principal+interest còn nợ, đơn vị borrowedAsset — field đã có trong `BorrowPosition` của `capital-provenance-ledger`, không phải `quantity` gốc lúc vay vì `quantity` không giảm theo REPAY) × `current_price` user nhập. Ghi rõ nhãn "ước tính, chưa gồm fee/slippage mua lại thực tế". | docs/RISK_RULES.md (R2: "hiển thị... dự toán USDT buyback"), architecture/capital-provenance-ledger.md (field `liabilityLedger`) | Verified (field đã tồn tại và đúng ngữ nghĩa outstanding principal+interest theo architecture đã READY của `capital-provenance-ledger`) |
| BR-010 | Mọi số liệu hiển thị phải gắn nhãn nguồn: "tự nhập" (current_price, và disclaimer cho collateral proxy) vs "đọc từ ledger/Binance" (first_borrow_entry_price, liability, totalCollateralValueInUSDT). | Quyết định scoping user 2026-10-02, US-004 | Verified |

## Acceptance criteria
| ID | Given / When / Then | Rule | Expected evidence |
|---|---|---|---|
| AC-001 | Given Borrow Position X có `first_borrow_entry_price` = 100, When user nhập `current_price` = 199, Then hệ thống trả `OK` (chưa chạm boundary) | BR-002 | Test dưới boundary |
| AC-002 | Given Borrow Position X có `first_borrow_entry_price` = 100, When user nhập `current_price` = 200, Then hệ thống trả `CRITICAL_REPAY_REQUIRED` (đúng boundary, `>=`) | BR-002 | Test đúng boundary |
| AC-003 | Given Borrow Position X có `first_borrow_entry_price` = 100, When user nhập `current_price` = 250, Then hệ thống trả `CRITICAL_REPAY_REQUIRED` kèm principal/interest/liability/ước tính buyback cost | BR-002, BR-009 | Test trên boundary, kiểm tra đủ field hiển thị |
| AC-004 | Given Borrow Position X đã `CRITICAL_REPAY_REQUIRED`, When xem chi tiết, Then UI hiển thị rõ "ước tính, chưa gồm fee/slippage" cho buyback cost, không trình bày như số chính xác | BR-009, BR-010 | Test nhãn disclaimer hiển thị |
| AC-005 | Given user có 2 Borrow Position OPEN: A (exposure 4,000 USDT), B (exposure 3,000 USDT); `totalCollateralValueInUSDT` = 20,000, When user xem risk summary, Then tổng exposure = 7,000, cap = 20,000/3 ≈ 6,666.67, hiển thị `OVER_BORROW_CAP` | BR-005, BR-006, BR-007 | Test tổng hợp nhiều position, so sánh đúng cap |
| AC-006 | Given tổng initial exposure đúng bằng cap (ví dụ exposure = 10,000, collateral = 30,000, cap = 10,000), When xem risk summary, Then không hiển thị `OVER_BORROW_CAP` | BR-007 | Test boundary bằng cap, theo đúng R1 "bằng cap được phép" |
| AC-007 | Given user chưa có Binance connection nào ở trạng thái VERIFIED, When tính risk summary, Then collateral hiển thị "chưa xác định" (không phải 0), cap không tính được, hệ thống hiển thị cảnh báo rõ "chưa kết nối/verify Binance, không thể tính cap" — không coi exposure luôn vượt cap một cách ngầm định | BR-006 | Test fixture không có connection VERIFIED → cảnh báo rõ lý do, không giá trị ngầm định gây hiểu lầm |
| AC-008 | Given user A và user B đều có Borrow Position, When user A gọi API risk summary của B (qua ID), Then hệ thống trả 403/404, không lộ dữ liệu | BR-001 | Test IDOR theo pattern đã áp dụng ở các feature trước |
| AC-009 | Given Borrow Position đã REPAID, When xem risk summary, Then không tính vào tổng initial exposure OPEN và không có R2 check (không còn liability để lo CRITICAL_REPAY_REQUIRED) | BR-005 | Test position REPAID bị loại khỏi tổng exposure OPEN |
| AC-010 | Given user chưa nhập `current_price` cho Borrow Position X, When xem risk summary, Then R2 status của X hiển thị "chưa kiểm tra" (không mặc định OK hoặc CRITICAL), phân biệt rõ với trạng thái đã tính | BR-003 | Test chưa nhập giá → trạng thái "chưa kiểm tra", không phải OK giả |

## Financial định nghĩa và UX
- Mọi exposure/cap/collateral/buyback cost dùng Decimal, đơn vị USDT trừ khi ghi rõ khác; không float.
- UI risk summary phải phân biệt rõ 3 nhóm số: (1) đọc từ ledger (`first_borrow_entry_price`, liability, exposure tính từ đó), (2) đọc từ Binance (`totalCollateralValueInUSDT` dùng làm collateral proxy, kèm disclaimer chưa verify bằng API thật), (3) user tự nhập (`current_price`). Không gộp 3 nhóm thành 1 số duy nhất không rõ nguồn.
- Mỗi risk check hiển thị kèm thời điểm tính (không cache ngầm, giống pattern "dữ liệu tại thời điểm HH:MM:SS" của `binance-read-only-connection`).
- Không có bước preview/confirm giao dịch Binance trong feature này vì không có mutation nào được thực hiện; chỉ là tính toán + hiển thị.

## Edge cases
- `first_borrow_entry_price` hoặc liability null/thiếu (dữ liệu ledger chưa đầy đủ) — không tính CRITICAL/OK ngầm định, hiển thị "thiếu dữ liệu, không thể tính risk" thay vì coi là OK.
- User nhập `current_price` <= 0 hoặc không phải số hợp lệ — từ chối input, không tính toán với giá trị vô nghĩa.
- Nhiều Borrow Position cùng asset vay (không thể xảy ra ở MVP vì `capital-provenance-ledger` giới hạn 1 OPEN/asset — BR-002 của feature đó) — risk-engine không cần tự xử lý trường hợp này, kế thừa invariant đã có; nếu invariant đó thay đổi sau, risk-engine phải re-verify BR-005.
- Margin account snapshot lỗi/timeout khi lấy collateral proxy — phải hiển thị "chưa đọc được collateral" khác với "collateral = 0", không kết luận vượt cap khi thực chất là lỗi đọc dữ liệu (theo AGENTS.md: timeout không đồng nghĩa thất bại).
- Giá trị `totalCollateralValueInUSDT` âm hoặc bằng 0 (về lý thuyết có thể xảy ra nếu tài khoản đang ở trạng thái rủi ro cao trên Binance) — vẫn dùng nguyên giá trị (có thể âm) làm collateral proxy, không ép về 0 dương; cap khi đó có thể âm hoặc 0, hiển thị luôn `OVER_BORROW_CAP` nếu có bất kỳ exposure nào — hiển thị rõ số âm/0, không che giấu.
- User có nhiều Binance connection VERIFIED cùng lúc (OQ-R03 của `binance-read-only-connection` vẫn OPEN, chưa chặn trùng) — risk-engine không tự chọn policy "dùng connection nào"; MVP dùng connection VERIFIED **gần nhất theo `lastVerifiedAt`** làm nguồn duy nhất (không cộng dồn nhiều account, vì "tổng giá trị" của 2 account riêng biệt trên Binance không cộng gộp có ý nghĩa nếu đó là 2 account khác nhau — architecture ghi rõ đây là lựa chọn kỹ thuật tạm, không phải policy nghiệp vụ đã duyệt) — ghi vào Open questions để product xác nhận lại nếu cần hỗ trợ multi-account tổng hợp.
- Rounding cap (chia 3 ra số lẻ) — hiển thị đủ số thập phân cần thiết để user hiểu, không làm tròn gây hiểu sai đã an toàn khi thực ra sát ngưỡng.

## Open questions / risks / dependencies
- OQ-RE01 | Owner: BA | Affected gate: BA_FEASIBILITY, ARCHITECTURE | BR-006/BR-009 kế thừa NEEDS_VERIFICATION từ `binance-read-only-connection` (field `totalCollateralValueInUSDT`, `/sapi/v1/margin/account`) — chưa có evidence gọi API thật (ghi nhận COND-001 tương tự của feature đó). BA cần xác nhận lại field này còn đúng hay cần fixture mới trước ARCHITECTURE.
- OQ-RE03 | Owner: Product + user | Affected gate: ARCHITECTURE | Khi user có nhiều Binance connection VERIFIED: MVP tạm dùng connection `lastVerifiedAt` gần nhất làm nguồn collateral duy nhất (xem Edge cases), không cộng dồn nhiều account. Đây là lựa chọn kỹ thuật tạm của architecture, không phải policy nghiệp vụ đã duyệt chính thức — product/user xác nhận lại nếu cần hỗ trợ multi-account tổng hợp sau.
- OQ-RE02 | Owner: Product + user | Affected gate: ARCHITECTURE, DESIGN | Khi nào thực sự cần Market Data tự động (bỏ input tay `current_price`)? Đây không phải blocker MVP (đã quyết định 2026-10-02 dùng input tay) nhưng ghi lại để không bị hiểu lầm là đã có feed giá tự động.
- Risk: collateral proxy (BR-006) dùng nguyên `totalCollateralValueInUSDT` Binance trả về, không áp haircut/valuation bổ sung của sản phẩm — R1 cap tính trên proxy này có thể sai lệch so với cap "chính thức" nếu BA sau này xác định công thức collateral sản phẩm cần khác (ví dụ loại trừ 1 số asset rủi ro cao). User đã accept risk này cho MVP (quyết định 2026-10-02); cần cảnh báo rõ trong UI mỗi lần hiển thị (BR-006), không chỉ ghi trong tài liệu.
- Risk: ước tính buyback cost (BR-009) không trừ fee/slippage thực tế — có thể khiến user chuẩn bị thiếu tiền khi thực sự mua lại trên Binance. Residual risk, cảnh báo rõ trong UI (AC-004), đầy đủ hơn thuộc Profit & Repay Calculator (feature khác).
- Dependency: nếu `capital-provenance-ledger` thêm cơ chế vay bổ sung vào 1 Borrow Position đang OPEN (hiện chưa có), BR-005 phải được BA xác nhận lại cách cộng initial exposure (đây chính là OQ-P04/phần "cộng khoản vay bổ sung" trong `docs/DOMAIN.md` — hiện không áp dụng vì cơ chế đó chưa tồn tại).

## Handoff checklist
- AC-001..AC-010 trace tới BR-001..BR-010; NEEDS_VERIFICATION (BR-006, BR-009) và OPEN_QUESTION (OQ-RE01, OQ-RE02) đã nêu rõ owner và gate bị chặn.
- 2 quyết định scoping MVP (current_price nhập tay, collateral proxy = `totalCollateralValueInUSDT` thô từ Binance) đã được user chốt ngày 2026-10-02, ghi trong Business rules là "quyết định scoping đã chốt", không phải giả định mới của agent này. Field cụ thể dùng để lấy giá trị đó (`totalCollateralValueInUSDT` thay vì `userAssets[USDT].netAsset` ban đầu) được sửa lại sau khi rà code thật của `binance-read-only-connection` — không đổi quyết định scoping của user, chỉ đổi cách hiện thực đúng ý quyết định đó.
- Feature có UI (user nhập current_price, xem risk summary) → cần `design-agent` chạy song song với `architect-agent` sau BA, theo `workflows/feature-development.md`.
- Đề xuất requirement_status: READY (đủ để BA feasibility review). Không tự duyệt BA.
