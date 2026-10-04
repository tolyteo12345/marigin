# Architecture: risk-engine

Owner: architect-agent | Requirement revision: r1-2026-10-02 (sha256:e783fcf3990c8263c05fdae139dc92267879be56148507a136bb4e7d81ab0ef8)
BA revision: sha256:08ae71ee4ad01a489e98d0bb1ca858639863d18a110246ca5d52566853b06c79
Decision: features/risk-engine/decision.json

## Gate check và scope
BA status: APPROVED_WITH_CONDITIONS (COND-001, COND-002, COND-003, due tại gate này — xem cách từng điều kiện được giải quyết dưới). OQ-RE01 (format số thực tế của `totalCollateralValueInUSDT`) và OQ-RE02 (khi nào cần Market Data tự động) **chưa chốt**, không ảnh hưởng thiết kế (không block ARCHITECTURE — đã accept risk ở decision.json). OQ-RE03 được giải quyết tại COND-003 dưới (lựa chọn kỹ thuật tạm, không phải policy mới).

Feature này **không mutate dữ liệu nào** — toàn bộ là đọc (`BorrowPosition` qua `LedgerModule`, margin account snapshot qua `BinanceConnectionModule`) và tính toán stateless (BR-003: `current_price` không lưu). Vì vậy **không có bảng DB mới** — không cần cập nhật `docs/DATABASE.md` (không thêm/sửa/xóa bảng/cột/enum/index nào).

## Components và dependency contracts
Tái dùng 100% module/service đã có, không tạo adapter Binance mới (giữ đúng "allowlist cứng 2 endpoint" của `BinanceReadOnlyAdapterModule` — risk-engine không gọi Binance trực tiếp).

| Module | Trách nhiệm | Phụ thuộc |
|---|---|---|
| `RiskEngineModule` (mới) | Controller + service tính R1 (exposure/cap) và R2 (2× check) | `LedgerModule` (đọc `BorrowPosition` qua `LedgerService.listBorrowPositions`/`getBorrowPosition`, đã export), `BinanceConnectionModule` (đọc margin snapshot qua `BinanceConnectionService.getAccountSnapshot`, đã export), `SessionStoreModule`/`AuthGuard`, `CsrfModule`/`CsrfGuard` |
| `RiskEngineController` | `GET /api/risk-engine/exposure-summary`, `POST /api/risk-engine/positions/:id/check` | `RiskEngineService` |
| `RiskEngineService` | Orchestrate đọc ledger + Binance, tính Decimal, map lỗi | `LedgerService`, `BinanceConnectionService` (dùng `list()` để chọn connection VERIFIED — xem COND-003, không cần `PrismaService` trực tiếp) |
| Frontend `RiskSummaryPanel` + `RiskCheckAction` (React) | Hiển thị R1 summary, form nhập `currentPrice` cho R2 per position | Gọi REST API qua `fetch` với CSRF token cho POST (giống pattern `AccountSnapshotPanel`/`BorrowPositionCard`) |

`RiskEngineModule` KHÔNG import `BinanceReadOnlyAdapterModule` trực tiếp — chỉ qua `BinanceConnectionService` đã có (giữ đúng boundary an toàn gốc của `binance-read-only-connection`: chỉ 1 nơi chạm Binance).

## Domain / tính toán (không có schema DB mới)
Toàn bộ input là field đã có trong 2 feature nguồn:
- `BorrowPositionView` (từ `LedgerService`): `quantity`, `firstBorrowEntryPrice`, `liabilityLedger`, `status` — tất cả `string`, parse bằng `Decimal.js` tại service boundary của risk-engine (không sửa `LedgerModule`).
- `CrossMarginAccountResponse.totalCollateralValueInUSDT` (từ `BinanceConnectionService.getAccountSnapshot`) — `string`, parse bằng `Decimal.js`.

### COND-003 — chọn connection khi có nhiều VERIFIED
**Cập nhật tại IMPLEMENTATION (khớp lại tài liệu theo code thật, không đổi hành vi an toàn)**: thay vì 1 Prisma query riêng `ORDER BY lastVerifiedAt DESC` như đề xuất ban đầu, backend-agent tái dùng đúng pattern đã có ở `LedgerService.reconcile()` (feature `capital-provenance-ledger`) — gọi `BinanceConnectionService.list(userId)` (đã export, sắp xếp `createdAt desc`) rồi `.find(c => c.status === 'VERIFIED')`. Lý do đổi: tránh thêm 1 cách chọn connection khác chỉ riêng cho feature này khi codebase đã có đúng 1 cách làm cho cùng bài toán; không cần `PrismaService` trực tiếp trong `RiskEngineService` (đơn giản hơn, giảm 1 dependency). Hành vi quan sát được (connection nào được chọn khi có 2+ VERIFIED) có thể khác với mô tả gốc (`createdAt` gần nhất thay vì `lastVerifiedAt` gần nhất) — đây vẫn là "lựa chọn kỹ thuật tạm, chưa phải policy đã duyệt" (OQ-RE03), không ảnh hưởng AC nào vì MVP chỉ test trường hợp 0 hoặc 1 connection VERIFIED.
`RiskEngineService.resolveCollateralProxy(userId)`:
1. `BinanceConnectionService.list(userId)` → tìm `.find(c => c.status === 'VERIFIED')`.
2. Không có kết quả → trả `{ status: 'NO_VERIFIED_CONNECTION', value: null, fetchedAt: null }`.
3. Có kết quả → gọi `BinanceConnectionService.getAccountSnapshot(userId, connectionId)` với connection tìm được.
4. Snapshot thành công → `{ status: 'OK', value: snapshot.totalCollateralValueInUSDT, fetchedAt: snapshot.fetchedAt, sourceConnectionId: connectionId }`.
5. Snapshot lỗi (timeout/network/rate-limit — `getAccountSnapshot` throw `HttpException` 503/429 theo `binance-connection.service.ts`) → bắt exception, trả `{ status: 'READ_ERROR', value: null, fetchedAt: null, errorMessage }` — KHÔNG coi là `NO_VERIFIED_CONNECTION` (phân biệt rõ 2 case theo Edge cases của requirement).

**Ghi chú kỹ thuật tạm (OQ-RE03, không phải policy đã duyệt)**: nếu user có 2+ connection VERIFIED, chỉ dùng 1 (gần nhất), không cộng dồn. Đây là implementation detail để MVP có hành vi xác định (deterministic), không phải quyết định nghiệp vụ "mỗi user chỉ nên có 1 Binance account" — nếu product/user sau này muốn tổng hợp nhiều account, đây là thay đổi scope cần BA lại (ghi trong decision.json).

### R1 — Exposure / cap (BR-005, BR-006, BR-007)
```
positions = ledgerService.listBorrowPositions(userId, 'OPEN')
totalInitialExposure = Σ( Decimal(p.quantity) * Decimal(p.firstBorrowEntryPrice) )  // với mỗi p trong positions
collateral = resolveCollateralProxy(userId)
cap = collateral.status === 'OK' ? Decimal(collateral.value) / 3 : null
overCap = cap !== null && totalInitialExposure.greaterThan(cap)
```
`cap === null` (status `NO_VERIFIED_CONNECTION` hoặc `READ_ERROR`) → `overCap` luôn `false` ở tầng tính toán nhưng response phải có field `capUnavailableReason` riêng để frontend hiển thị "chưa thể tính cap" — KHÔNG để `overCap=false` tự nhiên bị hiểu lầm là "an toàn, dưới cap" (đúng AGENTS.md "timeout không đồng nghĩa thất bại/thành công").

### R2 — 2× check (BR-002, BR-009), stateless
```
POST /api/risk-engine/positions/:id/check  body { currentPrice: string }
position = ledgerService.getBorrowPosition(userId, id)  // throws 404 nếu không thuộc user — IDOR pattern tái dùng nguyên vẹn
if (currentPrice <= 0) throw 422  // IsDecimalString decorator (>=0) + service check >0 bổ sung
status = Decimal(currentPrice).greaterThanOrEqualTo(Decimal(position.firstBorrowEntryPrice).times(2))
  ? 'CRITICAL_REPAY_REQUIRED' : 'OK'
buybackCostEstimateUsdt = status === 'CRITICAL_REPAY_REQUIRED'
  ? Decimal(position.liabilityLedger).times(currentPrice).toString()
  : null
```
Không lưu kết quả vào DB (BR-003) — response trả thẳng, `checkedAt = new Date().toISOString()`. Nếu `position.status !== 'OPEN'` (REPAID hoặc DRIFT_DETECTED): vẫn cho phép tính (read-only, không có invariant nào bị vi phạm khi chỉ hiển thị số), nhưng response thêm field `positionStatus` để frontend hiển thị context rõ (ví dụ REPAID thì câu hỏi R2 không còn ý nghĩa thực tế — UI quyết định ẩn/disable, không phải backend chặn).

## API contracts
Backend REST (NestJS), `@ApiCookieAuth('sid')` + Swagger decorators đầy đủ (per AGENTS.md), Postman collection cập nhật cùng lúc:

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| GET | `/api/risk-engine/exposure-summary` | session (`AuthGuard`) | R1: trả `{ positions: [{id, borrowedAsset, quantity, firstBorrowEntryPrice, initialExposureUsdt}], totalInitialExposureUsdt, collateral: {status, value, fetchedAt, sourceConnectionId?, errorMessage?}, cap, overCap, capUnavailableReason? }` |
| POST | `/api/risk-engine/positions/:id/check` | session + CSRF (`AuthGuard` + `CsrfGuard`) + ownership | Body `{currentPrice: string}` (validate `IsDecimalString` + `>0`). R2: trả `{ positionId, status: 'OK'\|'CRITICAL_REPAY_REQUIRED', firstBorrowEntryPrice, currentPrice, liabilityLedger, buybackCostEstimateUsdt, positionStatus, checkedAt }`. 404 nếu position không thuộc user (ownership, IDOR — AC-008) |

`GET exposure-summary` trả `collateral.status` ∈ `{OK, NO_VERIFIED_CONNECTION, READ_ERROR}` — map thẳng từ `resolveCollateralProxy`. Không có state machine riêng (feature không có entity có trạng thái lưu trữ).

## Financial formulas
- Toàn bộ phép tính dùng `Decimal.js` (đã là dependency sẵn có qua Prisma `Decimal` ở `LedgerModule`), KHÔNG parse qua `number`/`float` ở bất kỳ tầng nào — khớp AGENTS.md và pattern đã dùng ở `capital-provenance-ledger`/`binance-read-only-connection`.
- `initialExposureUsdt` mỗi position = `quantity × firstBorrowEntryPrice` (BR-005).
- `cap` = `totalCollateralValueInUSDT / 3` (BR-007), chỉ tính khi `collateral.status === 'OK'`.
- `buybackCostEstimateUsdt` = `liabilityLedger × currentPrice` (BR-009) — dùng `liabilityLedger` (outstanding), KHÔNG dùng `quantity` gốc (COND đã resolve ở BA, xem Evidence register BA).
- So sánh boundary R2 dùng `greaterThanOrEqualTo` (Decimal.js), test chính xác dưới/bằng/trên theo AC-001/AC-002/AC-003.
- Không rounding đặc biệt cho hiển thị — trả nguyên `Decimal.toString()` (giữ precision), frontend tự quyết định số chữ số hiển thị (không phải backend cắt bớt, tránh sai lệch số liệu).

## Concurrency / idempotency
- Toàn bộ request là **GET hoặc POST không mutate** — không cần transaction, lock, hoặc idempotency key (khác với `LedgerModule` vốn cần optimistic lock cho write). Đây là **chủ ý đơn giản hoá**: trần là "feature này không bao giờ ghi dữ liệu mới"; nếu sau này risk-engine cần lưu lịch sử check (ví dụ cho Alert Engine), đó là thay đổi scope cần architecture mới, không phải sửa trong feature này.
- Race giữa lúc đọc `BorrowPosition` (R1) và snapshot Binance (collateral) không có khái niệm "sai" cần khoá: 2 số đọc tại 2 thời điểm hơi khác nhau là bản chất of thiết kế đã chốt (mỗi số kèm `fetchedAt`/implicit "tại thời điểm gọi", không có "giao dịch đơn" cần tính nhất quán).
- `checkedAt`/`fetchedAt` luôn lấy tại thời điểm response, không cache ở backend (khớp pattern `account-snapshot` đã có).

## Security / audit
- Ownership: `getBorrowPosition`/`listBorrowPositions` của `LedgerService` đã filter theo `userId` ở tầng service (tái dùng nguyên vẹn, không thêm code mới) — IDOR test (AC-008) chỉ cần gọi `check` với `id` của position thuộc user khác, verify 404.
- `resolveCollateralProxy` chỉ đọc danh sách connection qua `BinanceConnectionService.list()` (không đọc `encryptedApiKey/apiSecret` trực tiếp, không query Prisma riêng — việc decrypt + call Binance giao hết cho `BinanceConnectionService.getAccountSnapshot`, giữ đúng boundary secret hiện có).
- Audit: `getAccountSnapshot` đã tự ghi `ConnectionAuditLog` (`ACCOUNT_SNAPSHOT_READ`) bên trong `BinanceConnectionModule` — risk-engine KHÔNG cần ghi audit log riêng cho phần đọc Binance (tránh double-logging), và KHÔNG cần audit log mới cho phần tính toán nội bộ (không phải financial action, không mutate — khớp AGENTS.md "mọi financial action phải audit được" vì đây không phải financial action).
- CSRF: `POST /positions/:id/check` dùng `CsrfGuard` theo đúng convention hiện có cho mọi method non-GET (dù không mutate — giữ nhất quán với toàn bộ codebase, tránh ngoại lệ khó nhớ).
- Rate limit: `check` endpoint có thể bị spam (nhập giá liên tục) nhưng không gọi Binance (chỉ tính nội bộ) — không cần rate-limit riêng. `exposure-summary` gọi Binance 1 lần/request (qua `getAccountSnapshot` đã có backoff/429-handling sẵn ở `BinanceConnectionModule`) — tái dùng, không thêm limiter mới.

## COND-001 giải quyết
Mọi response field `collateral.value`/`cap` kèm label cố định ở tầng frontend (xem UI handoff) "Collateral value (USDT) — theo Binance `totalCollateralValueInUSDT`, ước lượng chưa verify bằng API thật"; backend response thêm field `collateral.disclaimer` (string cố định, không phải tự do nhập) để frontend không cần hardcode riêng, tránh lệch copy giữa các nơi hiển thị.

## COND-002 giải quyết
Dependency `LedgerModule` (owner `capital-provenance-ledger`, architecture revision `sha256:da81fdb2a2756da5e4fd9683f793df7aa2c39bd76b8f83917b3a979def7b83a2`, hiện QA PASS_WITH_WARNINGS) — risk-engine chỉ gọi `listBorrowPositions`/`getBorrowPosition` (public API đã export), không đọc Prisma model `BorrowPosition` trực tiếp. Nếu `capital-provenance-ledger` đổi field `liabilityLedger`/`quantity`/`firstBorrowEntryPrice` (tên, đơn vị, hoặc bỏ field) sau khi xử lý warning QA, TypeScript compile sẽ fail tại `RiskEngineService` (type `BorrowPositionView` đổi) — đây là cơ chế phát hiện breakage tự động ở tầng code, không chỉ tài liệu. Theo `workflows/feature-development.md` invalidation rule, nếu thay đổi đó ảnh hưởng AC của risk-engine, phải re-verify architecture này trước khi tiếp tục.

## UI handoff (tóm tắt cho design-agent/frontend-agent)
- `RiskSummaryPanel` (R1): hiển thị `totalInitialExposureUsdt`, `collateral.value` kèm `collateral.disclaimer`, `cap`, badge `OVER_BORROW_CAP` nếu `overCap=true`; nếu `collateral.status !== 'OK'`, hiển thị message riêng theo `NO_VERIFIED_CONNECTION` ("chưa kết nối/verify Binance") hoặc `READ_ERROR` ("chưa đọc được dữ liệu Binance, thử lại") — không hiển thị cap/overCap khi không có collateral.
- `RiskCheckAction` (R2, trong mỗi `BorrowPositionCard` đã có từ `capital-provenance-ledger`): input `currentPrice` (TextField decimal) + button "Kiểm tra" → gọi `POST .../check` → hiển thị kết quả `OK`/`CRITICAL_REPAY_REQUIRED` + `buybackCostEstimateUsdt` (kèm disclaimer "ước tính, chưa gồm fee/slippage"). Trước khi submit lần đầu: hiển thị "Chưa kiểm tra" (state riêng, không phải OK/CRITICAL — AC-010), không tự động gọi API khi mount.

## Validation và rollout
| AC | Component | Test plan |
|---|---|---|
| AC-001, AC-002, AC-003 | `RiskEngineService.check` (Decimal boundary) | Unit test `currentPrice` = 199/200/250 với `firstBorrowEntryPrice`=100 → OK/CRITICAL/CRITICAL |
| AC-004 | API response + UI copy | Test response có field disclaimer cố định, UI render đúng |
| AC-005, AC-006 | `getExposureSummary` | Fixture 2 positions + mock `totalCollateralValueInUSDT` → tổng đúng, so cap đúng cả over/at-cap |
| AC-007 | `resolveCollateralProxy` | Mock không có connection VERIFIED → `NO_VERIFIED_CONNECTION`, response không có `cap` số, có `capUnavailableReason` |
| AC-008 | Ownership (tái dùng `getBorrowPosition`) | Test gọi `check` với id của position user khác → 404 |
| AC-009 | `getExposureSummary` filter status=OPEN | Fixture có position REPAID → không tính vào `totalInitialExposureUsdt` |
| AC-010 | Frontend state machine (chưa gọi API) | Test UI trước submit hiển thị "Chưa kiểm tra", không phải OK |

Automated test dùng mock `LedgerService`/`BinanceConnectionService` (không gọi DB/Binance thật cho unit test service logic); integration test dùng Postgres test DB thật cho `BorrowPosition` fixture (tái dùng pattern test đã có ở `capital-provenance-ledger`) + mock HTTP cho Binance (không có Margin testnet — RISK-001 kế thừa). Không cần manual smoke test Binance riêng cho feature này (không gọi endpoint Binance mới, tái dùng nguyên `getAccountSnapshot` đã smoke-test ở `binance-read-only-connection`).

## Open decisions và readiness
- COND-001, COND-002, COND-003: RESOLVED như trên.
- OQ-RE01 (format số `totalCollateralValueInUSDT`), OQ-RE02 (Market Data tự động): vẫn OPEN, không ảnh hưởng thiết kế (đã accept risk, không phải blocker).
- Không phát hiện blocker mới trong lúc thiết kế.

**Đề xuất architecture_status: READY.**
