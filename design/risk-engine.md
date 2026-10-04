# Design: risk-engine

Revision: r1-2026-10-02 | Owner: coordinator (design-agent role) | Decision: features/risk-engine/decision.json

## Input
- requirements/risk-engine.md r1-2026-10-02 (sha256:e783fcf3990c8263c05fdae139dc92267879be56148507a136bb4e7d81ab0ef8) — US-001..US-005, AC-001..AC-010
- architecture/risk-engine.md (đã READY cùng lúc) — API `GET /api/risk-engine/exposure-summary`, `POST /api/risk-engine/positions/:id/check`, response shape, `collateral.status` ∈ {OK, NO_VERIFIED_CONNECTION, READ_ERROR}
- Common component library hiện có: `frontend/src/components/common/{TextField,Button,SelectField,InlineMessage(InlineAlert/InlineStatus)}.tsx` — tái dùng nguyên bản, không thêm component mới cho feature này (không có pattern UI mới cần)

**Giả định cần coordinator xác nhận nếu sai**: `LedgerDashboardPage` (từ `design/capital-provenance-ledger.md`, đã implement) là nơi duy nhất hiển thị `BorrowPositionCard` hiện tại. Risk-engine **mở rộng** 2 chỗ trong page đó (thêm 1 widget đầu trang + thêm 1 action trong mỗi card đang OPEN) thay vì tạo page/route mới — vì dữ liệu risk gắn chặt với từng Borrow Position đã hiển thị ở đó, tách trang riêng sẽ buộc user chuyển qua lại không cần thiết. Nếu coordinator/product muốn 1 trang "Risk" riêng (ví dụ cho roadmap Alert Engine sau), đây là thay đổi scope cần design lại, không phải sửa nhỏ.

## Common component mapping
| Common component | Dùng ở |
|---|---|
| `TextField` (`type="text"`, `inputMode="decimal"`) | Input `currentPrice` trong `RiskCheckAction` |
| `Button` (`variant="primary"`/`"secondary"`) | "Kiểm tra" (R2), "Làm mới" (R1 summary) |
| `InlineAlert` (`role="alert"`) | `CRITICAL_REPAY_REQUIRED`, `OVER_BORROW_CAP`, lỗi đọc collateral (`READ_ERROR`), lỗi input (currentPrice ≤ 0) |
| `InlineStatus` (`role="status"`) | `OK` (R2 không chạm ngưỡng), đang tải/đang kiểm tra |

Không cần component mới. Không dùng `InlineAlert` cho `NO_VERIFIED_CONNECTION` (đây không phải lỗi/nguy hiểm, chỉ là thiếu thiết lập) — dùng text thường + link tới trang connection, giống cách `design/capital-provenance-ledger.md` xử lý state "chưa có dữ liệu" khác với "lỗi".

## Lưu ý Decimal
`currentPrice` dùng `TextField` với `type="text"`, `inputMode="decimal"`, validate regex `^\d*\.?\d+$` ở frontend trước khi enable nút "Kiểm tra" (không chặn nhập, chỉ disable submit) — không dùng `type="number"` (cùng lý do đã áp dụng ở `capital-provenance-ledger`: tránh browser tự làm tròn/ép float). Giá trị gửi API là string nguyên văn, không parse `Number`.

## Màn hình / trạng thái

### 1. `RiskSummaryWidget` (R1, mới — chèn vào đầu `LedgerDashboardPage`, trước `AvailableCapitalWidget`)
- Gọi `GET /api/risk-engine/exposure-summary` khi dashboard mount + `Button` secondary "Làm mới" (không auto-poll, giống `AccountSnapshotPanel`).
- Hiển thị:
  - "Tổng initial exposure: {totalInitialExposureUsdt} USDT" (đọc từ ledger, label "từ ledger nội bộ").
  - Nếu `collateral.status === 'OK'`: "Collateral value (USDT) — theo Binance `totalCollateralValueInUSDT`: {collateral.value}" + dòng nhỏ disclaimer lấy nguyên văn từ `collateral.disclaimer` (API trả, không hardcode duplicate ở nhiều nơi) + "Cap khuyến nghị (collateral/3): {cap} USDT" + "Dữ liệu tại {fetchedAt formatted HH:MM:SS UTC}".
  - Nếu `overCap === true`: `InlineAlert` "Tổng vay vượt cap khuyến nghị ({totalInitialExposureUsdt} > {cap} USDT). Đây là cảnh báo thông tin — hệ thống không tự chặn vay vì bạn tự thực hiện vay trên Binance."
  - Nếu `overCap === false` và `collateral.status === 'OK'`: `InlineStatus` "Trong giới hạn cap khuyến nghị."
  - Nếu `collateral.status === 'NO_VERIFIED_CONNECTION'`: text thường "Chưa có kết nối Binance đã verify — không thể tính cap. [Kết nối Binance](liên kết tới trang connection)."
  - Nếu `collateral.status === 'READ_ERROR'`: `InlineAlert` "Không thể đọc dữ liệu Binance để tính cap ({collateral.errorMessage}). Chưa đọc được ≠ an toàn — thử lại." + `Button` secondary "Thử lại" (gọi lại API, không tự động retry ngầm — khớp AGENTS.md).
  - Loading: "Đang tải dữ liệu rủi ro...".
  - Danh sách `totalInitialExposureUsdt` không bao gồm position `REPAID` (AC-009) — không cần hiển thị riêng, API đã lọc.

### 2. `RiskCheckAction` (R2, mới — thêm vào `BorrowPositionCard` đã có, chỉ hiện khi `status === 'OPEN'` hoặc `DRIFT_DETECTED`; ẩn khi `REPAID` vì liability đã về 0, không còn gì để "mua lại")
Vị trí: 1 section mới trong `BorrowPositionCard`, dưới các action hiện có ("Ghi nhận bán...", "Ghi nhận trả nợ..."), heading nhỏ "Kiểm tra rủi ro (2× giá vay đầu)".

- Trạng thái ban đầu (chưa submit lần nào trong session hiện tại — state frontend-only, không persist, khớp BR-003): hiển thị text "Chưa kiểm tra" (KHÔNG phải `InlineStatus`/`InlineAlert` — đây là neutral, không phải kết quả OK hay lỗi, để tránh AC-010 hiểu lầm là đã check và OK).
- `TextField` label "Giá hiện tại của {borrowedAsset} (USDT)" + `Button` primary "Kiểm tra" (disabled nếu input rỗng/không khớp regex decimal hoặc = 0).
- Submit → `POST /api/risk-engine/positions/:id/check` (CSRF token) với `{currentPrice}`.
  - Response `status === 'OK'`: `InlineStatus` "OK — giá hiện tại ({currentPrice}) chưa chạm ngưỡng 2× giá vay đầu ({firstBorrowEntryPrice})."
  - Response `status === 'CRITICAL_REPAY_REQUIRED'`: `InlineAlert` "⚠ CẦN CHUẨN BỊ TRẢ NỢ — giá hiện tại ({currentPrice}) đã ≥ 2× giá vay đầu ({firstBorrowEntryPrice}). Liability hiện tại: {liabilityLedger} {borrowedAsset}. Ước tính USDT cần mua lại: {buybackCostEstimateUsdt} USDT (ước tính, CHƯA gồm fee/slippage mua lại thực tế — xem giá thật trên Binance trước khi hành động)." Không có nút hành động nào khác ở đây (không auto-chain sang form bán/mua/trả nợ — user tự điều hướng tới action tương ứng đã có trong card, khớp AGENTS.md "không dùng alert để tự thực thi").
  - Lỗi 422 (currentPrice không hợp lệ): `InlineAlert` dưới input, không submit.
  - Lỗi network/5xx: `InlineAlert` "Không thể kiểm tra lúc này, thử lại." + giữ nguyên input user đã nhập (không clear).
- Mỗi lần "Kiểm tra" là 1 lần gọi API mới, kết quả cũ (nếu có) bị thay thế hoàn toàn bởi kết quả mới, kèm `checkedAt` hiển thị "Kiểm tra lúc {HH:MM:SS}" — không cache, không merge với lần trước (khớp BR-003 "không lưu như giá thị trường chính thức").

### 3. Accessibility
- `RiskSummaryWidget`/`RiskCheckAction` dùng đúng `role="alert"`/`role="status"` qua `InlineAlert`/`InlineStatus` sẵn có (screen reader tự đọc khi xuất hiện).
- `TextField` của `currentPrice` có `label`/`htmlFor` qua `useId` (pattern sẵn có), không dùng placeholder làm label.
- Nút "Kiểm tra" disabled có `aria-disabled` tự động từ thuộc tính `disabled` chuẩn HTML (không cần thêm).
- Màu `InlineAlert` cho `CRITICAL_REPAY_REQUIRED` giống màu lỗi hiện có (`--color-danger`) — chấp nhận dùng chung màu "error" cho "cảnh báo khẩn" vì common layer hiện chưa có mức "warning" riêng (không tự thêm token màu mới ngoài scope; nếu cần phân biệt rõ hơn sau, đó là thay đổi design-system riêng).

## Handoff checklist
- Mọi trạng thái bắt buộc theo AGENTS.md đã có spec: loading, error, empty (`NO_VERIFIED_CONNECTION` coi như 1 dạng "empty"), partial/unknown (`READ_ERROR` ≠ "collateral=0"), "chưa kiểm tra" riêng biệt với OK/CRITICAL (AC-010).
- Không có bước nào cho phép auto-submit hành động tài chính từ risk alert — mọi liên kết tới action (bán/mua/trả nợ) đều là navigation tới form đã có, user tự bấm, không tự động mở/điền sẵn.
- Không có open question nào ảnh hưởng implementation còn lại (OQ-RE01/RE02/RE03 không chặn UI, đã xử lý ở architecture).
- Đề xuất design_status: READY.
