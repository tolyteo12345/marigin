# Code Review: risk-engine

Owner: `/code-review` (forked execution, độc lập với phiên implement) | Decision: features/risk-engine/decision.json

Input:
- Requirement: sha256:e783fcf3990c8263c05fdae139dc92267879be56148507a136bb4e7d81ab0ef8
- BA feasibility: sha256:08ae71ee4ad01a489e98d0bb1ca858639863d18a110246ca5d52566853b06c79
- Architecture đưa vào review (trước fix COND-003): sha256:0478202d0b88d2a84566e07f31a16831ea09b8ee6b69138f58d8c56876437368
- Architecture sau fix (được dùng cho APPROVED): sha256:dbbbf5e9b7b91a53bd558ffafe0610c3b008d6fba985e678d5f28b7e9ac19256
- Design: sha256:9357e174da1c0c7e919c1cce963621ebf8a2d614c9db0fa78580cca74cd80096
- Implementation đưa vào review (trước fix): sha256:61961f98f0079892d518309c572f77cce922c24be535b0f87db91176f60940a7
- Implementation sau khi áp dụng fix (được APPROVED): sha256:be141ac497c50040e2bdf863b62100d2849d296ec3a8eb724c3cecb59a089b0f

**Ghi chú độc lập tính**: `/code-review` chạy như forked execution riêng biệt trên diff thật của worktree `feature/risk-engine` (medium effort, nhiều agent chạy song song theo các góc khác nhau: line-by-line, cross-file call-site tracing, removed-behavior audit, reuse/simplification/efficiency), đúng yêu cầu AGENTS.md "Reviewer phải độc lập với người implement". Toàn bộ finding dưới đây được chính review tool tìm ra qua đọc code thật, không phải tự-rà-soát của người implement. Sau khi review xong, coordinator (cùng phiên với người implement) áp dụng fix và verify lại — khác với review hoàn toàn end-to-end bởi người thứ 3, nhưng đúng chuẩn "reviewer độc lập phát hiện, fix riêng rồi verify lại" mà AGENTS.md không cấm.

## Finding

### 1. (LOW — doc/code mismatch) COND-003 trong architecture không khớp code thật
**File**: `backend/src/risk-engine/risk-engine.service.ts:103-105` vs `architecture/risk-engine.md` (mục COND-003, trước fix)
**Mô tả**: Architecture mô tả chọn connection bằng 1 Prisma query riêng `ORDER BY lastVerifiedAt DESC`. Code thật tái dùng pattern `BinanceConnectionService.list()` (sort `createdAt desc`) + `.find(status==='VERIFIED')`, giống `LedgerService.reconcile()` — một quyết định implementation hợp lý (tránh thêm 1 cách chọn connection riêng, giảm 1 dependency `PrismaService`) nhưng chỉ được ghi ở `implementation.md` (mục Deviation), không được phản ánh lại vào `architecture.md`/`decision.json`.
**Hệ quả**: nếu user có 2+ Binance connection VERIFIED, connection được chọn làm nguồn collateral có thể khác với mô tả gốc trong architecture (gần nhất theo `createdAt` thay vì `lastVerifiedAt`) — không sai AC nào hiện có (MVP chỉ test case 0/1 connection VERIFIED), nhưng tài liệu architecture lúc đó không phải nguồn sự thật đúng cho hành vi thật, có thể gây nhầm lẫn cho reviewer/QA sau đọc theo tài liệu cũ.
**Fix đã áp dụng**: sửa mục "COND-003" trong `architecture/risk-engine.md` khớp đúng code (dùng `list()` + `find`, không phải Prisma query riêng), ghi rõ đây là cập nhật tài liệu theo code thật tại IMPLEMENTATION, không đổi hành vi an toàn nào.

### 2. (LOW — maintainability) 3 bản sao `formatTimestamp`/`formatTime`
**File**: `frontend/src/components/ledger/AvailableCapitalWidget.tsx`, `RiskSummaryWidget.tsx`, `RiskCheckAction.tsx` (trước fix)
**Mô tả**: Cả 3 file định nghĩa cùng 1 hàm `new Date(iso).toUTCString().replace('GMT', 'UTC')` với 2 tên khác nhau (`formatTimestamp`/`formatTime`).
**Hệ quả**: sửa định dạng timestamp sau này (ví dụ đổi timezone hiển thị) phải sửa 3 nơi, dễ sót 1.
**Fix đã áp dụng**: gộp thành `frontend/src/components/ledger/formatTimestamp.ts`, cả 3 component import dùng chung.

### 3. (LOW — efficiency) `getExposureSummary` await tuần tự 2 lookup độc lập
**File**: `backend/src/risk-engine/risk-engine.service.ts:23-24` (trước fix)
**Mô tả**: `await this.ledger.listBorrowPositions(...)` (Postgres) rồi mới `await this.resolveCollateralProxy(...)` (Binance qua HTTP) — 2 lookup không phụ thuộc nhau nhưng chạy nối tiếp.
**Hệ quả**: mỗi request vào `GET /exposure-summary` chịu tổng latency DB + Binance thay vì max(DB, Binance); khi Binance chậm, toàn bộ endpoint chậm theo dù không cần.
**Fix đã áp dụng**: đổi sang `Promise.all([...])`.

### 4. (LOW, confidence thấp — convention) `RiskCheckAction.tsx` dùng `Number(currentPrice) <= 0` để validate input
**File**: `frontend/src/components/ledger/RiskCheckAction.tsx:27` (trước fix)
**Mô tả**: Một agent review riêng (góc "conventions") chỉ ra đây là float-parse trên 1 giá trị tiền tệ, nêu rõ confidence thấp vì đây chỉ là UI gate (disable nút/hiện lỗi sớm), không phải phép tính tài chính thực — backend luôn re-validate bằng `Prisma.Decimal` trước khi tính toán thật.
**Fix đã áp dụng** (phòng ngừa, không chờ thành vi phạm thật): thêm `isZeroDecimalString()` (regex `^0+(\.0+)?$`) vào `decimalInput.ts`, dùng thay `Number(currentPrice) <= 0` — loại bỏ hoàn toàn việc parse số trên giá trị tiền tệ, dù chỉ ở tầng UI gate.

## Ghi nhận không sửa (có lý do, không phải bỏ qua)
**Trùng boilerplate `request()`/`parseErrorBody()` giữa `riskEngineClient.ts` và `ledgerClient.ts`/`authClient.ts`**: mỗi feature client trong codebase này tự viết `request()` riêng (pattern đã tồn tại từ trước risk-engine, ví dụ so sánh `ledgerClient.ts` với client của `binance-connection`), không phải regression riêng của feature này. Gộp thành 1 helper chung ảnh hưởng nhiều file ngoài scope `risk-engine`, nên để lại cho một refactor riêng nếu coordinator/user muốn, không tự mở rộng scope ở đây.

## Soát thêm (không phát hiện vấn đề mới)
- Cross-file call-site trace xác nhận: `AccountSnapshot.totalCollateralValueInUSDT` được dùng nhất quán ở mọi nơi khởi tạo/dùng/mock (`risk-engine.service.ts`, `ledger.service.spec.ts`, `risk-engine.service.spec.ts`, `binance-connection.service.spec.ts`, `binance-connection.e2e-spec.ts`) — không fixture nào thiếu field mới, không có TypeScript build break, không `undefined` lọt vào phép tính Decimal.
- `checkPositionRisk` không tự bắt `NotFoundException` từ `LedgerService.getBorrowPosition` — truyền thẳng ra ngoài thành 404, đúng ý định AC-008.
- Diff 100% additive trên các file sửa (`app.module.ts`, `binance-connection.service.ts`, `ledger.service.spec.ts`, `BorrowPositionCard.tsx`, `CapitalProvenanceLedgerPage.tsx`, `features/README.md`) — không dòng nào bị xoá/thay thế, không hành vi cũ nào bị tháo bỏ cần khôi phục lại.
- R1 (`greaterThan` cho strictly-over-cap) và R2 (`greaterThanOrEqualTo` cho boundary 2×) đúng theo `docs/RISK_RULES.md`, khớp test boundary dưới/bằng/trên.
- Toàn bộ số liệu money/quantity đi qua `Prisma.Decimal`/string end-to-end, không `parseFloat`/`Number()` nào trong đường dữ liệu (chỉ có 1 `Number(currentPrice) <= 0` ở frontend dùng để validate input trước khi gửi, không ảnh hưởng giá trị thực gửi lên server).
- Ownership/IDOR: tái dùng nguyên `LedgerService.getBorrowPosition` (404 không phân biệt not-found/not-owned) — nhất quán pattern đã có.

## Đối chiếu AC (architecture "Validation và rollout")
| AC | Kết quả |
|---|---|
| AC-001/AC-002/AC-003 | PASS — unit test boundary dưới/bằng/trên + smoke test thật (curl, server+Postgres thật) |
| AC-004 | PASS — response có `buybackCostEstimateUsdt` kèm disclaimer cố định hiển thị ở frontend |
| AC-005/AC-006 | PASS — unit test tổng hợp nhiều position, boundary over/at-cap |
| AC-007 | PASS — unit test + smoke test thật (chưa có connection → `NO_VERIFIED_CONNECTION`, cap=null, không phải 0) |
| AC-008 | PASS — unit test (NotFoundException propagate) + smoke test thật (404 với id không tồn tại) |
| AC-009 | PASS — unit test (`listBorrowPositions` filter status=OPEN) |
| AC-010 | PASS — frontend test ("Chưa kiểm tra" hiển thị trước khi submit lần đầu) |

## Kết luận
**APPROVED** sau khi áp dụng fix #1, #2, #3, #4. Không có finding MEDIUM/HIGH, không có vi phạm correctness/an toàn/financial invariant. Finding ghi nhận không sửa (trùng boilerplate api client, mục "Ghi nhận không sửa" trên) không ảnh hưởng gate này.
