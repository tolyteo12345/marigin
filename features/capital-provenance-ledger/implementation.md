# Implementation: capital-provenance-ledger

Owner: coordinator (tổng hợp từ backend-agent + frontend-agent) | Architecture revision: sha256:da81fdb2a2756da5e4fd9683f793df7aa2c39bd76b8f83917b3a979def7b83a2
Design revision: sha256:5f8dda64c3c5006fd13db6f784b13bc0f8fa70a9ca4c0e0d810a73c164586f8f
Requirement revision: sha256:429b97a572705c75a7570e44054961ab5b8841cd554bc884e8e64760c07db5e6
Decision: features/capital-provenance-ledger/decision.json

## Trạng thái tổng quan
Implementation **READY**. Backend + frontend viết đầy đủ theo scope MVP đã chốt (chặn mixed-source, reserve 100% tới REPAID, chỉ BTC/ETH, 1 Borrow Position/asset, ngưỡng dust/drift = 0). Build sạch (`tsc`), 19 unit test backend mới (88/88 toàn bộ backend pass), 4 test frontend mới (29/29 toàn bộ frontend pass). Verify thật bằng curl end-to-end qua server thật + Postgres thật (không chỉ mock) — phát hiện và sửa 1 bug thật trong lúc đó (xem Deviation). Chưa chạy UI trong trình duyệt thật (môi trường này không có browser automation tool) — xem "Hạn chế".

## Deviation so với architecture (đã ghi lại, không tự ý âm thầm lệch)

**Bảng mới `PersonalCapitalDeclaration` (gap phát hiện khi implement)**: architecture mục "Financial formulas" tham chiếu `personalCapitalUsdt` (user tự khai báo) nhưng không định nghĩa nơi lưu. Thêm bảng 1 dòng/user, API `PUT /api/ledger/personal-capital`. Đây là chi tiết storage, không phải business rule mới — ghi ở `docs/DATABASE.md`, không bump revision architecture.md (cùng tinh thần deviation `encryptionIvApiSecret` ở feature trước).

**Bug thật phát hiện qua smoke test (không chỉ qua unit test mock)**: BR-002 (chặn mở 2 Borrow Position OPEN cùng asset) ban đầu trả **500** thay vì 409 khi chạy thật với Postgres. Nguyên nhân: Postgres báo vi phạm partial unique index (tạo bằng raw SQL trong migration) về cho Prisma dưới dạng "Unique constraint failed on the fields: (`userId`,`borrowedAsset`)" — theo **tên cột**, không theo **tên index** như code ban đầu giả định khi check `err.meta.target` chứa `'BorrowPosition_user_asset_open_unique'`. Unit test (mock) đã viết fixture `p2002(['BorrowPosition_user_asset_open_unique'])` sai theo giả định đó nên không bắt được bug này — chỉ lộ ra khi gọi API thật. Đã sửa: check hint `'borrowedAsset'` thay vì tên index, và sửa lại fixture test khớp hành vi Postgres thật (ghi rõ trong comment code + test). Đây là bài học: với partial unique index tạo bằng raw SQL, không nên giả định `err.meta.target` trả về tên index.

**RepayForm không hiển thị được thông báo "đã trả hết/đã giải phóng"**: phát hiện qua test, không qua smoke test curl (curl chỉ thấy response JSON đúng, không thấy UI). `BorrowPositionCard` ban đầu đóng `RepayForm` ngay khi `onDone` chạy (cùng lúc set state REPAID), nên message inline trong `RepayForm` chưa kịp render thì form đã unmount. Sửa: không tự đóng `RepayForm` khi thành công (khác `SellAssetForm` — ghi rõ lý do trong comment), để message "đã giải phóng vốn tự do" (design mục 8b) thực sự hiển thị được cho user.

## Backend (`backend/`)
Module mới `LedgerModule` (`src/ledger/`): `LedgerService`, `LedgerController`, DTOs, `decimal-string.ts` (custom `class-validator` decorator, chỉ nhận chuỗi số thập phân không âm — không bao giờ `type: 'number'`), `unique-violation.ts`, `views.ts` (Decimal → string khi trả response). Đăng ký vào `app.module.ts`. Tái dùng `BinanceConnectionModule` (feature trước) cho reconciliation — không gọi Binance mới, chỉ gọi lại `list`/`getAccountSnapshot` đã có.

Schema Prisma: `BorrowPosition`, `AllocationLot`, `LedgerEvent`, `PersonalCapitalDeclaration` (deviation ở trên), 4 enum. Partial unique index `BorrowPosition_user_asset_open_unique` (BR-002) thêm bằng SQL thủ công trong migration (Prisma không khai báo được `WHERE`). Migration: `20261001062909_capital_provenance_ledger`, `20261001063024_capital_provenance_ledger_personal_capital` — cả 2 đã `prisma migrate dev` thật lên Postgres local.

Các quyết định implementation trong phạm vi "quyết định kỹ thuật, không phải chính sách nghiệp vụ" (đã nêu ở BA/architecture COND-002/COND-003):
- **Idempotency** (COND-002): header `Idempotency-Key` bắt buộc mọi POST/PUT ghi event; `LedgerEvent` có `@@unique([userId, idempotencyKey])`. Mỗi service method pre-check bằng `findUnique`, và bắt `P2002` (hint `'idempotencyKey'`) làm lưới an toàn cho race double-submit thật.
- **Optimistic lock** (COND-003): cột `version` trên `BorrowPosition`/`AllocationLot`, mọi mutation dùng `updateMany({ where: { id, version } })` trong `$transaction` cùng việc ghi `LedgerEvent`; `count === 0` → `ConflictException`.
- **Correction** (COND-004/OQ-P05): thiết kế tối giản có chủ đích — set giá trị mới tường minh (`newLiabilityLedger`/`newReservedAmountUsdt`/`newRemainingQuantity`) kèm `reason`, ghi `before`/`after` vào payload, không cố "replay" lại công thức gốc. Đây cũng là cách duy nhất chuyển `DRIFT_DETECTED` → `OPEN`.
- **Reconcile**: gọi lại `BinanceConnectionService.list`/`getAccountSnapshot` của user hiện tại (lấy connection `VERIFIED` đầu tiên — MVP giả định 1 connection/user theo scope feature trước); lỗi/timeout → `RECONCILE_UNKNOWN`, không đổi status (AGENTS.md "timeout không đồng nghĩa thất bại").
- Ngưỡng dust/drift (COND-001b): hằng số `DUST_THRESHOLD_NATIVE_UNITS = new Prisma.Decimal(0)` — 1 chỗ duy nhất trong `ledger.service.ts`, dễ đổi sau khi BA/user chốt giá trị khác.

Swagger: decorator đầy đủ trên `LedgerController` + DTO (`@nestjs/swagger`), phục vụ tại `/api/docs` (xác nhận route `ledger` xuất hiện trong `GET /api/docs-json`). Postman: `backend/postman/margin-trading-capital-provenance-ledger.postman_collection.json` — đã chạy thật từng request (không chỉ đọc), xem "Bằng chứng kiểm thử".

**Env**: không thêm biến môi trường mới (tái dùng toàn bộ hạ tầng auth/CSRF/Binance adapter đã có).

## Frontend (`frontend/`)
Common component mới: `SelectField` (`src/components/common/SelectField.tsx`), cùng pattern `TextField`. `src/api/ledgerClient.ts` + `ledgerTypes.ts`: mọi số liệu là string, `newIdempotencyKey()` dùng `crypto.randomUUID()`.

`src/components/ledger/`: `CapitalProvenanceLedgerPage` (trang chính), `AvailableCapitalWidget`, `BorrowPositionForm`, `BorrowPositionCard`, `SellAssetForm`, `RepayForm`, `ReconcilePanel`, `AllocationLotForm`, `AllocationLotCard`, `EventHistoryPanel` (kèm `CorrectionForm`), `decimalInput.ts` (validate client-side trước submit, khớp `backend/src/ledger/decimal-string.ts`).

Route mới `/ledger` (`router/routes.tsx`), mục nav mới "Sổ theo dõi nguồn vốn" nhóm "Nguồn vốn" (`navigation/navConfig.ts`, icon mới `LedgerIcon`).

**Hạn chế đã biết (không che giấu)**:
- Sau khi tạo 1 `AllocationLot` funded từ 1 Borrow Position qua `AllocationLotForm` ở trang chính, `BorrowPositionCard` tương ứng không tự refetch danh sách lot của nó ngay lập tức (chỉ refetch khi `refreshToken` nội bộ của chính card đó đổi). Dữ liệu trong DB đúng ngay lập tức; đây là vấn đề staleness UI (cần tải lại trang hoặc tương tác khác với đúng card đó để thấy lot mới), không phải sai số liệu tài chính. Ghi lại để review/QA biết, không tự nhận là đã hoàn thiện 100% UX.
- Chưa chạy thật trong trình duyệt (Chrome/etc.) — môi trường thực thi này không có browser automation tool. Đã verify qua: (1) `tsc -b` sạch, (2) `vite build` sạch, (3) Testing Library (jsdom) mô phỏng tương tác người dùng thật (type/click) cho 4 kịch bản chính, không phải chỉ snapshot tĩnh. Khuyến nghị QA gate chạy thật bằng trình duyệt trước khi coi feature DONE.

## Bằng chứng kiểm thử (đã tự chạy lại, không chỉ tin báo cáo)

Backend:
```
cd backend && npx tsc --noEmit -p tsconfig.json   # sạch
cd backend && npx jest
Test Suites: 9 passed, 9 total
Tests:       88 passed, 88 total   # 69 cũ (user-authentication + binance-read-only-connection) + 19 mới (ledger.service.spec.ts)
```

Smoke test thật (server thật port 3101, Postgres thật, không mock) — chạy qua curl mô phỏng đúng luồng Postman collection:
- Tạo Borrow Position (ZEC, 25.1, giá 420) → 201, status OPEN.
- Tạo trùng asset khi còn OPEN → **409** (sau khi sửa bug nêu ở Deviation; trước đó là 500).
- Replay cùng `Idempotency-Key` với payload khác → trả lại đúng bản ghi cũ (id không đổi), không tạo trùng.
- Tạo Allocation Lot BTC funded từ Borrow Position → 201.
- Bán 1 phần lot (0.075/0.15, proceeds 3500 USDT) → `reservedAmountUsdt` của position tăng đúng 3500.
- Trả nợ vượt quá liability → **422**, message đúng yêu cầu dùng Correction.
- Trả nợ đúng hết (25.1) → status **REPAID**, `reservedAmountUsdt` về **0** (giải phóng).
- Reconcile khi chưa có Binance connection verified → `RECONCILE_UNKNOWN`, không đổi status.
- Tạo Correction → ghi event mới, event gốc giữ nguyên trong lịch sử.
- `GET /api/docs-json` xác nhận toàn bộ route `ledger` có mặt (Swagger).

Frontend:
```
cd frontend && npx tsc -b --noEmit   # sạch
cd frontend && npx vitest run
Test Files  7 passed (7)
Tests       29 passed (29)   # 25 cũ + 4 mới (CapitalProvenanceLedgerPage.test.tsx)
cd frontend && npm run build   # sạch
cd frontend && npm run lint    # chỉ còn warning set-state-in-effect giống pattern đã có sẵn ở AccountLinkPanel/BinanceConnectionsPage, không phải lỗi mới
```

## Cập nhật sau CODE_REVIEW (2026-10-02)
`/code-review` (độc lập, forked execution) tìm ra 2 finding thật, cả hai đã sửa:

1. **RepayForm tái sử dụng Idempotency-Key cho lần trả nợ thứ 2** (`frontend/src/components/ledger/RepayForm.tsx`): form này cố ý không tự đóng sau khi thành công (để hiện thông báo "đã giải phóng vốn", xem Deviation ở trên) — nhưng key sinh bằng `useState(newIdempotencyKey())` không đổi, nên lần trả nợ thứ 2 trong cùng form bị backend coi là replay của lần 1 (idempotency), **không ghi event mới, không trừ liability**, mà không báo lỗi gì — user tưởng đã trả thành công. Sửa: sinh key mới sau mỗi lần submit thành công. Thêm test regression `RepayForm.test.tsx` xác nhận 2 lần submit dùng 2 Idempotency-Key khác nhau.
2. **`createAllocationLot` trả 422 thay vì 409 khi Borrow Position nguồn đang DRIFT_DETECTED** (`backend/src/ledger/ledger.service.ts`): architecture.md quy định BR-009 (khoá thao tác khi DRIFT_DETECTED) áp dụng chung 1 cơ chế 409 cho cả `sell-asset`/`repay`/`sell-lot`/`allocation-lots` (dùng position làm nguồn) — code chỉ áp dụng đúng cho 3 cái đầu qua `assertActionable`, còn nhánh tạo lot lại tự viết check riêng trả 422 cho mọi trạng thái khác OPEN (gộp nhầm DRIFT_DETECTED với REPAID). Sửa: gọi `assertActionable` khi status=DRIFT_DETECTED trước (409), chỉ còn lại REPAID/trạng thái khác thật sự là 422. Thêm test `BR-009: rejects funding from a DRIFT_DETECTED Borrow Position with 409`.

Sau fix: backend 89/89 pass (thêm 1 test), frontend 30/30 pass (thêm 1 test). Không phát hiện thêm vấn đề mới khi re-verify.

## Đề xuất trạng thái
implementation_status: **READY** (đã áp dụng fix từ code review). review_status: đề xuất **APPROVED** sau khi áp dụng 2 fix trên — ghi bởi coordinator, không tự ý APPROVED thay reviewer độc lập đã chạy.
