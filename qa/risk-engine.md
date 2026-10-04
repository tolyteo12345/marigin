# QA report: risk-engine

Owner: coordinator (qa-agent role) | Implementation revision: sha256:4bfc0fab0c7515707a74d83e65195e6ac916574d98af443efe217c9792002378 (review APPROVED tại `features/risk-engine/review.md` sha256:e88c0390cb5df13c9e43cf7b9060517b98d49b7cd4dfe907ce3e43a3d4fc9a55)
Requirement: sha256:e783fcf3990c8263c05fdae139dc92267879be56148507a136bb4e7d81ab0ef8 | Architecture: sha256:dbbbf5e9b7b91a53bd558ffafe0610c3b008d6fba985e678d5f28b7e9ac19256 | Design: sha256:9357e174da1c0c7e919c1cce963621ebf8a2d614c9db0fa78580cca74cd80096
Environment/mode: backend thật (NestJS dev server, port cô lập 3103) + PostgreSQL thật (local, schema đã migrate, không có bảng mới cho feature này) + frontend test qua Testing Library (jsdom, không phải browser thật) | Run time: 2026-10-02 ~15:21–15:23 UTC
Decision: features/risk-engine/decision.json

## Bằng chứng đã tự chạy lại (không chỉ tin review.md)
```
cd backend && npx tsc --noEmit -p tsconfig.json && npx jest
Test Suites: 10 passed, 10 total
Tests:       99 passed, 99 total

cd frontend && npx tsc --noEmit -p tsconfig.json && npx vitest run && npm run build
Test Files  8 passed (8)
Tests       32 passed (32)
✓ built in 201ms
```

Server thật (port 3103, tách biệt server dev khác đang chạy trên 3000/3101) + Postgres thật, chạy `newman run backend/postman/margin-trading-risk-engine.postman_collection.json --env-var baseUrl=http://localhost:3103/api --env-var setupEmail=<unique>`:
```
requests: 15, failed: 0
prerequest-scripts: 7, failed: 0
test-scripts: 1, failed: 0
```
Toàn bộ luồng (register → tạo Borrow Position → GET exposure-summary → check dưới/tại boundary → check input invalid (422) → check id không tồn tại (404)) chạy thật end-to-end, không mock. Status code từng request khớp đúng mô tả trong collection (200/201/422/404).

Bổ sung bằng curl thủ công (case Postman collection không cover tự động — cần nhiều Borrow Position cùng user, hoặc so sánh trạng thái trước/sau REPAY):

| Case | Lệnh | Kết quả |
|---|---|---|
| BR-005 (tổng exposure nhiều position) | Tạo 2 Borrow Position (ZEC 10×100=1000, WLD 20×50=1000), GET exposure-summary | `totalInitialExposureUsdt:"2000"`, `positions` liệt kê đúng cả 2, mỗi `initialExposureUsdt` đúng |
| AC-009 (loại REPAID khỏi tổng) | Repay hết position ZEC (10), GET exposure-summary lại | `totalInitialExposureUsdt:"1000"` (chỉ còn WLD), ZEC không còn trong `positions` |
| R2 trên position đã REPAID (hành vi theo spec, không phải backend tự chặn — xem architecture.md) | POST check position ZEC (đã REPAID) với currentPrice=500 | `positionStatus:"REPAID"`, `status:"CRITICAL_REPAY_REQUIRED"` (500≥2×100 theo công thức, đúng toán học), `buybackCostEstimateUsdt:"0"` (= liabilityLedger 0 × 500) — đúng theo thiết kế "backend không tự chặn, frontend ẩn UI này khi terminal" (`BorrowPositionCard` chỉ render `RiskCheckAction` khi `!terminal`) |
| Swagger | `GET /api/docs-json` | Có đủ `/api/risk-engine/exposure-summary` (GET) và `/api/risk-engine/positions/{id}/check` (POST) |

## Đối chiếu Acceptance Criteria
| AC | Trạng thái | Bằng chứng |
|---|---|---|
| AC-001 (OK dưới boundary) | PASS | unit + newman thật (currentPrice=800 < 840) |
| AC-002 (CRITICAL tại boundary, `>=`) | PASS | unit + newman thật (currentPrice=840 == 2×420) |
| AC-003/BR-009 (buyback cost dùng liabilityLedger) | PASS | unit (60×250=15000, không dùng quantity gốc 100) + newman thật (25.1×840=21084) |
| AC-004 (disclaimer hiển thị) | PASS | response có field `buybackCostEstimateUsdt` + frontend `RiskCheckAction` render kèm câu "ước tính, CHƯA gồm fee/slippage" (frontend test xác nhận text hiển thị) |
| AC-005/AC-006 (tổng exposure + cap over/at) | PASS (unit, mock collateral) + PASS (curl thật cho phần tổng exposure, xem bảng trên) | Case `OVER_BORROW_CAP` thật với 1 Binance connection VERIFIED thật **chưa test được** — không có Binance account thật để verify connection trong môi trường này (xem Defects/warnings WARNING-001, kế thừa RISK-001 từ `binance-read-only-connection`) |
| AC-007 (NO_VERIFIED_CONNECTION ≠ 0) | PASS | unit + newman/curl thật (chưa có connection → `cap:null`, `capUnavailableReason` có nội dung, không phải `cap:0`) |
| AC-008 (IDOR/404) | PASS | unit + newman thật (id không tồn tại → 404) |
| AC-009 (loại REPAID khỏi tổng OPEN) | PASS | unit + curl thật (xem bảng trên) |
| AC-010 (trạng thái "Chưa kiểm tra" riêng biệt) | PASS | frontend test (Testing Library) — text "Chưa kiểm tra" hiển thị trước khi submit lần đầu |

## Required suites (đối chiếu docs/RISK_RULES.md "Required QA", chỉ áp dụng phần liên quan tới risk-engine)
- **R2 2× boundary**: PASS — dưới/bằng/trên đều test (unit + newman/curl thật).
- **Cap boundary (R1)**: PASS cho phần tính toán (over/at/under, unit); **PASS_WITH_LIMITATION** cho phần đọc collateral thật từ Binance (chỉ mock, không có Binance account thật — kế thừa RISK-001).
- **Concurrent requests / duplicate / out-of-order events**: N/A — feature không ghi dữ liệu nào (stateless, không có entity để race), không có khái niệm duplicate event ở đây.
- **Unknown outcome (timeout)**: PASS — unit test `getAccountSnapshot` throw → `READ_ERROR`, phân biệt rõ với `NO_VERIFIED_CONNECTION` (không coi timeout là "không có kết nối" hoặc "collateral=0").
- **Stale data**: PASS — mỗi request là tính mới hoàn toàn (`fetchedAt`/`checkedAt` theo thời điểm gọi), không cache.
- **No confirmation/replay/expired preview, mode isolation, partial fill, sell proceeds reservation, mixed-source sale, interest accrual**: N/A — feature không có mutation/execution/preview-confirm nào (chỉ đọc + tính), các khái niệm này thuộc `capital-provenance-ledger`/feature execution tương lai, không phải risk-engine.
- **Rounding/dust**: N/A theo thiết kế — không có policy rounding riêng (trả nguyên `Decimal.toString()`, không cắt/làm tròn).

## Defects / warnings
- **WARNING-001** (chưa fix, chấp nhận được cho MVP, kế thừa RISK-001 từ `binance-read-only-connection`) — case R1 `OVER_BORROW_CAP`/collateral `status:"OK"` với dữ liệu Binance **thật** (không mock) chưa có evidence — không có Margin testnet và không có tài khoản Binance thật trong môi trường QA này để tạo 1 `BinanceConnection` VERIFIED thật. Risk: field `totalCollateralValueInUSDT` thật từ Binance có thể khác định dạng/giá trị so với fixture test (ví dụ precision, dấu âm thật có xảy ra không). Owner: user/QA, nên làm 1 lần manual smoke test với Binance account thật (chỉ GET, không mutate) trước khi coi DONE hoàn toàn — không chặn QA PASS_WITH_WARNINGS vì toàn bộ logic nội bộ (so sánh, chia cap, format response) đã test đầy đủ qua unit + đã verify field tồn tại đúng tên trong code thật của `binance-read-only-connection` (xem analysis/risk-engine-feasibility.md EV-001 cập nhật).
- **WARNING-002** (chưa fix, giới hạn môi trường) — chưa test UI bằng trình duyệt thật (Chrome/Firefox); môi trường thực thi không có công cụ browser automation. Testing Library (jsdom) đã mô phỏng tương tác thật (nhập giá, bấm nút) cho 2 kịch bản chính (R1 over-cap, R2 OK→CRITICAL) nhưng không thay được việc nhìn UI thật (layout, màu `InlineAlert` dùng chung cho cả lỗi và cảnh báo CRITICAL — xem design.md mục Accessibility, đã ghi là chủ ý). Khuyến nghị: user/QA mở `npm run dev` thử tay luồng: mở trang Ledger → thấy `RiskSummaryWidget` → mở 1 `BorrowPositionCard` OPEN → nhập giá vào `RiskCheckAction` → bấm Kiểm tra.
- **WARNING-003** (NOT_RUN, chủ ý theo scope) — OQ-RE03 (nhiều Binance connection VERIFIED cùng lúc, chọn connection nào) không test được vì không tạo được 2 connection VERIFIED thật trong môi trường này (lý do giống WARNING-001). Code hiện tại chọn connection đầu theo `createdAt desc` (xem architecture.md COND-003 đã cập nhật khớp code) — hành vi deterministic nhưng chưa verify bằng dữ liệu thật 2 connection khác nhau.
- Không có defect CRITICAL/HIGH. Không có finding nào che giấu vấn đề correctness/an toàn/financial invariant (feature không thực hiện financial action nào, chỉ hiển thị cảnh báo thông tin — AGENTS.md "không dùng alert để tự thực thi" đã verify qua code review không có call nào tới Binance write endpoint hoặc ledger mutation).

## Verdict
Tất cả AC có thể kiểm chứng trong môi trường hiện tại (không cần Binance account thật) đều **PASS**, bao gồm boundary 2× chính xác dưới/bằng/trên, loại REPAID khỏi tổng exposure, phân biệt rõ "chưa có connection" vs "lỗi đọc" vs "collateral=0", và IDOR. 3 mục WARNING đều là giới hạn môi trường (không có Binance account thật, không có browser automation), không phải lỗi phát hiện rồi bỏ qua — đã ghi rõ residual risk và owner, không che giấu correctness tài chính nào vì toàn bộ phép tính nội bộ (không phụ thuộc dữ liệu Binance thật) đã PASS đầy đủ.

**Đề xuất qa_status: PASS_WITH_WARNINGS** (WARNING-001, WARNING-002, WARNING-003 cần user/product owner xác nhận chấp nhận trước khi coi feature DONE, theo đúng Definition of Done trong `workflows/feature-development.md`).
