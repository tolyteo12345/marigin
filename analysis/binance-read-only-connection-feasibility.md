# BA feasibility: binance-read-only-connection

Requirement revision: r1-2026-09-29 (sha256:169ac1c4dd000a187ecfcd150e43f8d0a74b752c485782e51b87418d25f213dc) | Owner: ba-feasibility-agent
Decision: features/binance-read-only-connection/decision.json
Status: APPROVED_WITH_CONDITIONS

## Scope và assumption challenge
Requirement giả định (đúng, đã kiểm chứng bằng official docs, xem Evidence register):
- Có endpoint riêng biệt cho Cross Margin (`/sapi/v1/margin/account`) tách biệt khỏi Isolated Margin (`/sapi/v1/margin/isolated/account`) — nghĩa là "account mode" không phải một field chọn được mà là **endpoint nào được gọi**. accountType trong response của endpoint Cross Margin còn phân biệt tiếp Classic (MARGIN_1) vs Pro (MARGIN_2) — đây là phát hiện quan trọng: requirement AC-003 cần điều chỉnh vì "không phải Cross Margin Classic" gồm 2 trường hợp khác nhau (Isolated/Spot → gọi sai endpoint hoàn toàn; Cross Margin Pro → cùng endpoint nhưng accountType=MARGIN_2) — kiến trúc phải xử lý cả hai.
- Permission scope của API key **có thể** đọc được qua endpoint riêng (`/sapi/v1/account/apiRestrictions`), không phải suy ra từ margin account response. Đây là một API call bổ sung, không phải field có sẵn trong response margin account.
- Margin sandbox/testnet **không tồn tại** — Binance testnet (testnet.binance.vision) chỉ hỗ trợ `/api` (Spot), không hỗ trợ `/sapi` (Margin). Đây là rủi ro thực chất cho test strategy: architecture/QA không được giả định có safe live-equivalent environment cho Margin; phải dùng mocked/fixture response cho automated test, và bất kỳ verification thủ công với tài khoản thật phải dùng GET-only calls (an toàn vì không mutate) với tài khoản test của chính dev/QA, không phải tài khoản user thật.

Requirement giả định cần điều chỉnh: US-003/AC-004 "phát hiện permission-too-broad" — khả thi kỹ thuật (field enableWithdrawals, enableSpotAndMarginTrading, enableMargin, enableFutures, enableVanillaOptions, enablePortfolioMarginTrading đều có), nhưng đòi hỏi **2 API call riêng biệt khi verify connection** (1) `/sapi/v1/margin/account` để xác nhận account mode, (2) `/sapi/v1/account/apiRestrictions` để đọc permission. Cả hai đều GET/USER_DATA, không mutate — an toàn với nguyên tắc READ_ONLY.

## Evidence register
| ID | Claim / exact API behavior | Official URL + section | Checked at | Account scope | Evidence / limitations | Status |
|---|---|---|---|---|---|---|
| EV-001 | `GET /sapi/v1/margin/account` (USER_DATA, signed) trả về `accountType` = "MARGIN_1" (Cross Margin Classic) hoặc "MARGIN_2" (Cross Margin Pro); các field khác: created, borrowEnabled, marginLevel, collateralMarginLevel, totalAssetOfBtc, totalLiabilityOfBtc, totalNetAssetOfBtc, TotalCollateralValueInUSDT, tradeEnabled, transferInEnabled, transferOutEnabled, userAssets[] (asset, borrowed, free, interest, locked, netAsset) | https://developers.binance.com/docs/margin_trading/account/Query-Cross-Margin-Account-Details | 2026-09-29 (UTC) | Binance.com, Cross Margin | Đọc trực tiếp từ trang docs chính thức qua fetch tự động; chưa test bằng key thật (không có Margin testnet — xem EV-004). Field `interest` trong userAssets đã là outstanding interest theo tài liệu, không cần tự cộng thêm — khớp BR-007, nhưng chưa có fixture response mẫu thực tế để confirm định dạng số chính xác (string) | NEEDS_VERIFICATION (định dạng số/rounding cần fixture thực tế trước khi code) |
| EV-002 | Endpoint Cross Margin và Isolated Margin là hai đường dẫn khác nhau (`/sapi/v1/margin/account` vs `/sapi/v1/margin/isolated/account`); không có endpoint chung tự phát hiện mode | https://developers.binance.com/docs/margin_trading/account | 2026-09-29 (UTC) | Binance.com | Danh sách endpoint từ trang chính thức | Verified |
| EV-003 | `GET /sapi/v1/account/apiRestrictions` (USER_DATA, signed) trả về boolean fields: enableReading, enableMargin, enableSpotAndMarginTrading, enableWithdrawals, enableInternalTransfer, enableFutures, enableVanillaOptions, enablePortfolioMarginTrading — cho phép phát hiện permission scope của key | https://developers.binance.com/docs/wallet/account/api-key-permission | 2026-09-29 (UTC) | Binance.com, mọi account | Đọc từ trang docs chính thức; đây là API nằm dưới nhóm Wallet, không phải Margin — cần xác nhận key chỉ cần enableReading (mặc định bật) là gọi được endpoint này, không cần enableMargin | NEEDS_VERIFICATION (permission tối thiểu để tự gọi endpoint này chưa test thực tế) |
| EV-004 | Binance testnet (testnet.binance.vision) chỉ hỗ trợ `/api` (Spot); KHÔNG hỗ trợ `/sapi` (Margin) | https://testnet.binance.vision/ (FAQ) | 2026-09-29 (UTC) | Testnet | Không có Margin sandbox chính thức nào được biết đến; automated test phải dùng mocked HTTP response, không có real sandbox integration test khả thi | Verified (giới hạn xác nhận, ảnh hưởng test strategy) |
| EV-005 | Request ký bằng HMAC-SHA256 trên query string + body; cần `timestamp` (ms) và `recvWindow` (default 5000ms, max 60000ms); server reject nếu lệch giờ vượt recvWindow | https://developers.binance.com/docs/binance-spot-api-docs/rest-api/general-info | 2026-09-29 (UTC) | Chung cho REST API | Chưa xác nhận chính xác mã lỗi (-1021) từ trang này — cần fixture lỗi thực tế trước khi code error handling chi tiết | NEEDS_VERIFICATION (exact error code cho clock skew) |
| EV-006 | Rate limit dùng header `X-MBX-USED-WEIGHT-*`; vượt giới hạn trả HTTP 429 kèm `Retry-After`; lặp lại vi phạm bị ban IP (HTTP 418, 2 phút–3 ngày) | https://developers.binance.com/docs/binance-spot-api-docs/rest-api/general-info | 2026-09-29 (UTC) | Chung cho REST API | Đọc từ docs chính thức; đủ để thiết kế backoff nhưng chưa có giá trị weight cụ thể của margin/account và apiRestrictions endpoint — cần tra thêm khi architecture thiết kế rate-limit budget | NEEDS_VERIFICATION (exact weight cost/endpoint) |

Ghi chú phương pháp: evidence trên lấy qua fetch tự động trang developers.binance.com chính thức (không phải blog/StackOverflow), có URL + ngày kiểm tra. Do công cụ fetch dùng model tóm tắt, đã re-verify riêng field `accountType` bằng cách yêu cầu trích dẫn nguyên văn để tránh model tự diễn giải theo thuật ngữ đã có sẵn trong prompt — kết quả khớp ("MARGIN_1 for Cross Margin Classic, MARGIN_2 for Cross Margin Pro"), củng cố độ tin cậy nhưng đây vẫn không thay thế việc gọi API thật với sample response trước khi code (xem EV-001/EV-003/EV-005/EV-006 NEEDS_VERIFICATION).

## Financial feasibility
Feature này KHÔNG thực hiện phép tính tài chính mới — chỉ đọc và hiển thị nguyên trạng field Binance trả về (units: string theo đúng Binance, không convert qua float — khớp AGENTS.md/docs/CAPITAL_PROVENANCE.md). `userAssets[].interest` là outstanding interest sẵn có theo tài liệu (EV-001); hiển thị trực tiếp, không cộng thêm — khớp BR-007. Không có công thức derive (exposure, PnL, risk) trong phạm vi feature này nên không có rủi ro double-count ở feature này; rủi ro double-count thuộc trách nhiệm feature dùng data này sau (Risk Engine, Ledger).

Không có worked example cần thiết vì không có tính toán — chỉ pass-through hiển thị.

## Provenance analysis
Không áp dụng cho feature này: feature không ghi nhận borrow/sell/buy event, không tạo lot hay reservation. Dữ liệu đọc được (balance/liability) chỉ dùng để hiển thị, không được feature này dùng để tự suy provenance (khớp AGENTS.md: "Không suy provenance từ balance"). Ghi rõ trong architecture: output của feature này là raw reference data, không phải ledger event.

## API/security/operational feasibility
- Permissions cần thiết cho key user cung cấp: tối thiểu "Enable Reading" (USER_DATA read) trên Binance. Endpoint `/sapi/v1/margin/account` và `/sapi/v1/account/apiRestrictions` đều là GET/USER_DATA — không endpoint nào trong feature này là TRADE hoặc yêu cầu withdraw permission. Kiến trúc phải đảm bảo code path không bao giờ gọi endpoint khác nhóm này (enforce bằng allowlist, không chỉ convention).
- Test environment: không có Margin testnet (EV-004) → automated test dùng mocked/fixture HTTP response dựng từ schema chính thức (EV-001/EV-003), khớp AGENTS.md "Automated tests không giao dịch LIVE" và docs/RISK_RULES.md "chỉ mocks/simulator/verified safe test environment". Nếu cần xác nhận thủ công với tài khoản thật, dùng tài khoản margin thật của dev/QA (không phải user), chỉ GET calls — an toàn nhưng phải ghi rõ trong QA plan là "manual verification, không phải automated live test".
- Idempotency: verify connection và read data đều là GET, không có side effect Binance — không cần idempotency key phía Binance; nhưng vẫn cần transactional lưu trạng thái verify nội bộ (tránh race khi user xóa connection giữa lúc đang gọi — đã nêu trong requirement edge case).
- Timeout/reconciliation: verify timeout ≠ invalid (đã ghi requirement AC là gap — cần architecture thiết kế trạng thái riêng UNKNOWN/PENDING_VERIFY, không map timeout → INVALID).
- Rate limit: cần backoff theo `Retry-After`/weight header (EV-006); nhiều user verify/đọc đồng thời phải qua hàng đợi hoặc per-key rate limiting ở app layer, không chặn toàn hệ thống (đã nêu trong requirement edge case, khả thi kỹ thuật).

## AC coverage và missing cases
| AC | Feasible? | Ghi chú |
|---|---|---|
| AC-001 | Feasible | Dùng EV-001 (accountType=MARGIN_1) |
| AC-002 | Feasible | Binance trả lỗi signature/auth rõ ràng (mã lỗi cụ thể cần fixture — NEEDS_VERIFICATION nhẹ, không chặn) |
| AC-003 | Feasible nhưng cần bổ sung case | Phải phân biệt (a) gọi đúng endpoint nhưng accountType=MARGIN_2 (Cross Margin Pro) → reject rõ "Pro không hỗ trợ"; (b) tài khoản không có Cross Margin (endpoint trả lỗi vì chưa mở Cross Margin) → reject "chưa mở Cross Margin". Requirement hiện chỉ nói chung chung "account mode khác" — architecture cần 2 nhánh lỗi riêng. Bổ sung AC-003b vào architecture/implementation, không coi là AC mới cần BA lại vì cùng rule BR-001/BR-005. |
| AC-004 | Feasible với điều kiện | Cần 2 API call (EV-001 + EV-003); nếu call thứ 2 (apiRestrictions) lỗi/permission thiếu để tự gọi (NEEDS_VERIFICATION EV-003), hệ thống phải fallback hiển thị "không xác định được permission scope" thay vì im lặng coi là an toàn — đây là **condition** bắt buộc trước ARCHITECTURE READY cho phần này. |
| AC-005 | Feasible | EV-001 cung cấp đủ field |
| AC-006 | Feasible | Thuần app-layer ownership/authorization, không phụ thuộc Binance |
| AC-007 | Feasible | Thuần app-layer, xóa key khỏi storage |
| AC-008 | Feasible | Dùng EV-005/EV-006 để thiết kế timeout/backoff |

## Decision
**APPROVED_WITH_CONDITIONS**. Requirement khả thi kỹ thuật với evidence chính thức đã thu thập (EV-001..EV-006). Không có blocker cứng nào ngăn ARCHITECTURE bắt đầu, nhưng có 3 điều kiện bắt buộc phải resolve trước ARCHITECTURE READY (không phải trước khi bắt đầu thiết kế):

- COND-001 | Owner: architect-agent (thiết kế) + BA (xác nhận lại nếu cần fixture thật) | due_gate: ARCHITECTURE | Phải lấy được sample response thật (hoặc fixture cực kỳ sát tài liệu) cho `/sapi/v1/margin/account` và `/sapi/v1/account/apiRestrictions` trước khi chốt schema lưu trữ số liệu (định dạng string/decimal chính xác, list đầy đủ field) — EV-001/EV-003 còn NEEDS_VERIFICATION về định dạng số thực tế.
- COND-002 | Owner: architect-agent | due_gate: ARCHITECTURE | Thiết kế rõ nhánh lỗi AC-003b (Cross Margin Pro vs chưa mở Cross Margin) thay vì gộp chung "account mode không hỗ trợ".
- COND-003 | Owner: architect-agent | due_gate: ARCHITECTURE | Thiết kế fallback an toàn khi không xác định được permission scope (gọi apiRestrictions lỗi) — phải fail-closed về mặt cảnh báo (hiển thị "không xác định", không mặc định "an toàn"), khớp AGENTS.md "fail-closed khi permission/scope không xác minh được".

Open questions kế thừa từ requirement (không phải blocker BA, nhưng ảnh hưởng ARCHITECTURE — giữ nguyên trạng thái OPEN, không tự chọn policy):
- OQ-R01: RESOLVED bởi EV-001/EV-002 (đã có evidence) — có thể đóng ở decision.json.
- OQ-R02: RESOLVED bởi EV-003 (đã có evidence, khả thi) — có thể đóng ở decision.json.
- OQ-R03, OQ-R04: vẫn OPEN, thuộc product/user decision, không phải BA.
- OQ-R05: RESOLVED bởi EV-004 (xác nhận không có Margin testnet) — có thể đóng, nhưng risk kèm theo (test strategy phải dùng mock) phải note trong architecture.

Risk mới phát sinh (đề xuất ghi vào decision.json risks, cần user/architect acceptance, không phải invariant vi phạm):
- RISK-001: Không có Margin sandbox chính thức → automated test 100% dựa trên mocked fixture xây từ tài liệu, không phải từ real API response đã verify end-to-end. Residual risk: nếu Binance thay đổi field/response thực tế khác tài liệu, test không phát hiện được cho tới khi chạy thật (GET-only, không rủi ro tài chính, nhưng có thể gây lỗi hiển thị). Mitigation đề xuất: manual smoke test bằng tài khoản margin thật của dev/QA (chỉ GET) trước khi release, ghi evidence riêng trong QA — không thuộc "automated test dùng live trading" nên không vi phạm AGENTS.md.
