# Implementation: risk-engine

Owner: coordinator (tổng hợp từ backend-agent + frontend-agent) | Architecture revision: sha256:0478202d0b88d2a84566e07f31a16831ea09b8ee6b69138f58d8c56876437368
Design revision: sha256:9357e174da1c0c7e919c1cce963621ebf8a2d614c9db0fa78580cca74cd80096
Requirement revision: sha256:e783fcf3990c8263c05fdae139dc92267879be56148507a136bb4e7d81ab0ef8
Decision: features/risk-engine/decision.json

## Trạng thái tổng quan
Implementation **READY**. Không có bảng DB mới (đúng như architecture) — feature chỉ đọc + tính Decimal, không mutate. Build sạch (`tsc`) backend + frontend, 10 unit test backend mới (99/99 toàn bộ backend pass), 6 test frontend mới/sửa (32/32 toàn bộ frontend pass). Verify thật bằng curl end-to-end qua server NestJS thật + Postgres thật (không chỉ mock).

## Deviation so với architecture (đã ghi lại, không tự ý âm thầm lệch)

**`AccountSnapshot` (binance-read-only-connection) thiếu field `totalCollateralValueInUSDT`**: architecture giả định `BinanceConnectionService.getAccountSnapshot()` đã trả field này (vì nó có trong `CrossMarginAccountResponse` raw và trong fixture test), nhưng khi đọc code thật, hàm `getAccountSnapshot()` chỉ map một tập con field cụ thể (`fetchedAt`, `accountType`, `marginLevel`, `totalAssetOfBtc`, `totalLiabilityOfBtc`, `totalNetAssetOfBtc`, `userAssets`) — không có `totalCollateralValueInUSDT`. Đây là gap phát hiện khi implement, không phải trong architecture review. Sửa tối thiểu: thêm field này vào interface `AccountSnapshot` và vào object trả về của `getAccountSnapshot()` (`backend/src/binance-connection/binance-connection.service.ts`) — field này **Binance đã trả sẵn trong response thật**, chỉ là bị lọc bỏ trước đây vì feature nguồn chưa cần dùng. Additive, không đổi field/behavior nào đã có; test cũ của `binance-connection`/`ledger` dùng `expect(snapshot.field).toBe(...)` (không exact-object-equality) nên không bị phá — chỉ cần thêm field vào 1 fixture test (`backend/test/ledger.service.spec.ts`) đang xây response Binance mock thủ công. Không bump revision `architecture/binance-read-only-connection.md` (không đổi AC/behavior của feature đó), chỉ ghi lại ở đây theo đúng tinh thần deviation `encryptionIvApiSecret` đã làm ở `docs/DATABASE.md`.

**COND-003 (chọn connection khi có nhiều VERIFIED) — khớp luôn với pattern đã có, không cần logic mới**: architecture đề xuất query riêng `ORDER BY lastVerifiedAt DESC`, nhưng khi đọc `LedgerService.reconcile()` (feature `capital-provenance-ledger`) thấy nó đã giải quyết đúng bài toán này bằng cách gọi `binanceConnections.list(userId)` (đã export, sort theo `createdAt desc`) rồi `.find(c => c.status === 'VERIFIED')`. Dùng lại chính xác pattern đó cho nhất quán toàn codebase, thay vì thêm 1 cách chọn connection khác (theo `lastVerifiedAt`) chỉ riêng cho feature này — đơn giản hơn, không có Prisma query mới, không lệch AC nào (OQ-RE03 vẫn giữ nguyên tinh thần "lựa chọn kỹ thuật tạm, chưa phải policy").

## Backend (`backend/`)
Module mới `RiskEngineModule` (`src/risk-engine/`): `RiskEngineService`, `RiskEngineController`, `dto/check-position-risk.dto.ts`, `views.ts`. Đăng ký vào `app.module.ts`. Tái dùng 100% `LedgerService` (`listBorrowPositions`/`getBorrowPosition`, đã export từ `LedgerModule`) và `BinanceConnectionService` (`list`/`getAccountSnapshot`, đã export) — không import `BinanceReadOnlyAdapterModule` hay `PrismaService` trực tiếp, giữ đúng boundary an toàn gốc.

Không có migration Prisma nào (không có bảng/cột mới) — `docs/DATABASE.md` không cần cập nhật (đúng như architecture đã nêu).

API: `GET /api/risk-engine/exposure-summary` (R1, không CSRF vì chỉ đọc), `POST /api/risk-engine/positions/:id/check` (R2, CSRF — theo convention mọi non-GET trong codebase, dù không mutate DB). Toàn bộ tính toán dùng `Prisma.Decimal` (reuse, không thêm dependency mới), trả response dạng string, không parse `number`.

Swagger: decorator đầy đủ trên `RiskEngineController` (`@nestjs/swagger`), tự xuất hiện tại `/api/docs` (route `risk-engine` đã xác nhận có trong `RouterExplorer` log khi start server thật). Postman: `backend/postman/margin-trading-risk-engine.postman_collection.json` — đã chạy thật từng request bằng `curl` mô phỏng đúng luồng (xem "Bằng chứng kiểm thử"), không chỉ đọc qua.

**Env**: không thêm biến môi trường mới.

## Frontend (`frontend/`)
`src/api/riskEngineClient.ts` + `riskEngineTypes.ts`: cùng pattern `ledgerClient.ts` (mọi số liệu string, `fetch` với CSRF cho POST).

`src/components/ledger/`: thêm `RiskSummaryWidget.tsx` (R1 — chèn vào đầu `CapitalProvenanceLedgerPage`, trước `AvailableCapitalWidget`) và `RiskCheckAction.tsx` (R2 — chèn vào `BorrowPositionCard`, cùng vị trí với `ReconcilePanel`, chỉ hiện khi không `terminal` tức là OPEN hoặc DRIFT_DETECTED). Không thêm common component mới — tái dùng `TextField`/`Button`/`InlineAlert`/`InlineStatus`, tái dùng `isDecimalString` từ `decimalInput.ts` đã có (không viết lại regex).

Không có route mới — feature mở rộng trang `/ledger` đã có, không cần đổi `navConfig.ts`.

**Hạn chế đã biết (không che giấu)**:
- Chưa chạy thật trong trình duyệt (Chrome/etc.) — môi trường thực thi này không có browser automation tool. Đã verify qua: (1) `tsc --noEmit` sạch cả 2 phía, (2) Testing Library (jsdom) mô phỏng tương tác người dùng thật (type/click) cho luồng R1 over-cap và R2 OK→CRITICAL, (3) backend đã verify bằng HTTP thật (curl) qua server NestJS + Postgres thật, không chỉ mock. Khuyến nghị QA gate chạy thật bằng trình duyệt trước khi coi feature DONE.
- `RiskSummaryWidget`/`RiskCheckAction` dùng `InlineAlert` (màu "error") cho cả `CRITICAL_REPAY_REQUIRED` lẫn lỗi thật (network/validation) — đã ghi rõ trong `design/risk-engine.md` mục Accessibility là chủ ý đơn giản hoá (common layer chưa có mức "warning" riêng), không phải thiếu sót.

## Lưu ý quan trọng về vị trí làm việc
Toàn bộ implementation này được thực hiện trong worktree `margin-trading-feature-risk-engine` (branch `feature/risk-engine`), đúng theo AGENTS.md. Trong lúc thực hiện, các thay đổi ban đầu bị tạo nhầm trực tiếp trên `main` (worktree chính) — đã phát hiện và sửa bằng `git stash` (tạo ở main) → `git stash pop` (áp dụng ở worktree `feature/risk-engine`) trước khi viết implementation report này; `main` đã xác nhận sạch lại (`git status` chỉ còn thư mục không liên quan `.claude/`, `.demo/`). `node_modules` của worktree này là symlink trỏ sang `../margin-trading/{backend,frontend}/node_modules` (không `npm install` lại, tiết kiệm thời gian/dung lượng) — cần thay bằng `npm install` thật trước khi coi đây là môi trường production/CI độc lập.

## Bằng chứng kiểm thử (đã tự chạy lại trong worktree đúng branch, không chỉ tin báo cáo)

Backend:
```
cd backend && npx tsc --noEmit -p tsconfig.json   # sạch
cd backend && npx jest
Test Suites: 10 passed, 10 total
Tests:       99 passed, 99 total   # 89 cũ + 10 mới (risk-engine.service.spec.ts)
```

Smoke test thật (server NestJS thật port 3101, Postgres thật, không mock) — curl mô phỏng đúng luồng Postman collection:
- `GET /risk-engine/exposure-summary` khi chưa có gì → `{positions:[],totalInitialExposureUsdt:"0",collateral:{status:"NO_VERIFIED_CONNECTION",...},cap:null,overCap:false,capUnavailableReason:"..."}`.
- Tạo Borrow Position (ZEC, 25.1, 420) qua `/ledger/borrow-positions` (feature trước) → dùng làm input test.
- `POST .../check` với `currentPrice=800` (< 840 = 2×420) → `status:"OK"`, `buybackCostEstimateUsdt:null`.
- `POST .../check` với `currentPrice=840` (== boundary) → `status:"CRITICAL_REPAY_REQUIRED"`, `buybackCostEstimateUsdt:"21084"` (= liabilityLedger 25.1 × 840, đúng BR-009, KHÔNG dùng quantity gốc).
- `POST .../check` với `currentPrice=0` → **422** `"currentPrice phải lớn hơn 0."`.
- `POST .../check` với id không tồn tại → **404** (IDOR-safe, tái dùng nguyên `getOwnedPosition` của `LedgerService`).
- `GET /risk-engine/exposure-summary` sau khi có 1 position OPEN → `totalInitialExposureUsdt:"10542"` (= 25.1×420, đúng BR-005).

Frontend:
```
cd frontend && npx tsc --noEmit -p tsconfig.json   # sạch
cd frontend && npx vitest run
Test Files  8 passed (8)
Tests       32 passed (32)   # 26 cũ (+2 route mock bổ sung vào test cũ) + 6 mới/net (RiskSummaryWidget + RiskCheckAction qua CapitalProvenanceLedgerPage.test.tsx)
cd frontend && npm run lint   # chỉ warning set-state-in-effect giống pattern đã có sẵn (AvailableCapitalWidget, CapitalProvenanceLedgerPage...), không phải lỗi mới riêng của risk-engine
```

## Cập nhật sau CODE_REVIEW (2026-10-02)
`/code-review` (độc lập, forked execution, nhiều agent chạy song song theo nhiều góc) tìm ra 4 finding, đã xử lý:

1. **COND-003 trong `architecture/risk-engine.md` không khớp code thật** (đã sửa): tài liệu gốc mô tả chọn connection bằng 1 Prisma query riêng `ORDER BY lastVerifiedAt DESC`, nhưng code thật (xem Deviation ở trên) tái dùng pattern `BinanceConnectionService.list()` + `.find(status==='VERIFIED')` giống `LedgerService.reconcile()` (chọn theo `createdAt desc`, không phải `lastVerifiedAt`). Review đúng: implementation.md có ghi deviation nhưng architecture.md chưa được cập nhật lại — đã sửa mục "COND-003" trong `architecture/risk-engine.md` khớp đúng code, không đổi hành vi (vẫn chỉ ảnh hưởng case hiếm 2+ connection VERIFIED, ngoài scope AC hiện tại).
2. **3 bản sao `formatTimestamp`/`formatTime`** (`AvailableCapitalWidget.tsx`, `RiskSummaryWidget.tsx`, `RiskCheckAction.tsx`) — đã gộp thành 1 file `frontend/src/components/ledger/formatTimestamp.ts`, cả 3 component import dùng chung.
3. **`getExposureSummary` await tuần tự 2 lookup độc lập** (DB + Binance) — đã đổi sang `Promise.all` để chạy song song, giảm latency.
4. **Trùng boilerplate `request()`/`parseErrorBody()` giữa `riskEngineClient.ts` và `ledgerClient.ts`/`authClient.ts`** — ghi nhận, KHÔNG sửa trong feature này: đây là pattern trùng lặp đã tồn tại từ trước (mỗi feature client tự viết `request()` riêng, ví dụ `ledgerClient.ts` so với `binanceConnectionClient.ts`), không phải regression riêng của risk-engine. Gộp thành 1 helper chung ảnh hưởng nhiều file ngoài scope feature này — để lại cho một refactor riêng nếu coordinator/user muốn, không tự mở rộng scope ở đây.
5. **`RiskCheckAction.tsx` dùng `Number(currentPrice) <= 0` để validate input** (finding riêng, confidence thấp, từ agent review góc "conventions") — dù chỉ là UI gate (không phải phép tính tài chính thật, backend luôn re-validate bằng Decimal), đã sửa phòng ngừa bằng `isZeroDecimalString()` (regex, không parse số) thêm vào `decimalInput.ts`, loại bỏ hoàn toàn việc gọi `Number()` trên giá trị tiền tệ dù chỉ ở tầng UI.

Sau fix: backend `tsc --noEmit` sạch, `jest` 99/99 pass (không đổi số lượng, chỉnh sửa không thêm/xoá test). Frontend `tsc --noEmit` sạch, `vitest` 32/32 pass. Không phát hiện thêm vấn đề mới khi re-verify.

## Đề xuất trạng thái
implementation_status: **READY** (đã áp dụng 4/5 fix từ code review, 1 finding ghi nhận không sửa có lý do). review_status: **APPROVED** (xem features/risk-engine/review.md) — các finding còn lại không ảnh hưởng correctness/an toàn.
