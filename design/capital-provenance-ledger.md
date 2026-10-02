# Design: capital-provenance-ledger

Revision: r1-2026-10-01 | Owner: coordinator (design-agent role) | Decision: features/capital-provenance-ledger/decision.json

## Input
- requirements/capital-provenance-ledger.md r1-2026-10-01 (sha256:429b97a572705c75a7570e44054961ab5b8841cd554bc884e8e64760c07db5e6) — US-001..US-008, AC-001..AC-010 (+ AC-011 đề xuất BA)
- architecture/capital-provenance-ledger.md (sha256:da81fdb2a2756da5e4fd9683f793df7aa2c39bd76b8f83917b3a979def7b83a2) — API contracts, state machine `BorrowPositionStatus`, entity `BorrowPosition`/`AllocationLot`/`LedgerEvent`, idempotency key, optimistic lock
- Common component library hiện có: `frontend/src/components/common/{TextField,Button,InlineMessage}.tsx` — tái dùng nguyên bản, không phát minh pattern UI mới cho phần đã có pattern

**Giả định cần coordinator xác nhận nếu sai**: route/shell đã có sẵn từ `app-navigation-shell` (QA PASS_WITH_WARNINGS) — feature này chỉ thêm 1 mục nav mới ("Ledger" hoặc tương đương), không tự thiết kế lại shell.

## Common component mapping
| Common component | Dùng ở |
|---|---|
| `TextField` | Mọi input số lượng/giá/USDT (type="text", xem Lưu ý Decimal), tên/ghi chú |
| `Button` (`variant="primary"`/`"secondary"`) | Submit mọi form, Reconcile, Xác nhận correction, Thử lại |
| `InlineAlert` (`role="alert"`) | Mọi lỗi (422/409/timeout), banner DRIFT_DETECTED, banner "cần xử lý thủ công" (OQ-P05) |
| `InlineStatus` (`role="status"`) | Đang gửi, thành công, đang reconcile |

**Common component mới cần thêm**: `SelectField` (label + `<select>`, cùng pattern với `TextField`: `label`/`htmlFor`/`id` tự sinh qua `useId`). Lý do: feature này là nơi đầu tiên cần dropdown (chọn `fundingSource`, chọn `asset` BTC/ETH, chọn Borrow Position làm nguồn) — common layer hiện chưa có pattern tương đương, không phải trùng lặp phát minh. Spec tối thiểu: `{label, value, onChange, options: {value, label}[], required?}`, giữ cùng class/spacing với `TextField` để UI nhất quán.

Không cần `Badge`/`Table` component riêng: trạng thái hiển thị bằng `InlineAlert`/`InlineStatus` như các feature trước; bảng lịch sử dùng `<table>` chuẩn với `<th scope="col">` (giống `AccountSnapshotPanel` ở `design/binance-read-only-connection.md`).

## Lưu ý Decimal (áp dụng toàn bộ form)
Mọi input số lượng/giá/USDT dùng `TextField` với `type="text"`, `inputMode="decimal"`, validate bằng regex (ví dụ `^\d+(\.\d+)?$`) ở frontend trước khi submit — **không** dùng `type="number"` (browser number input có thể làm tròn/chuyển sang float ở một số trình duyệt, vi phạm AGENTS.md "không float cho money/quantity"). Giá trị gửi lên API luôn là string nguyên văn user nhập, không parse thành `Number` ở frontend.

## Màn hình / trạng thái

### 1. `LedgerDashboardPage` — trang tổng (US-001..US-008)
- Heading "Sổ theo dõi nguồn vốn" (Capital Provenance Ledger).
- `AvailableCapitalWidget` (mục 2) trên cùng.
- `Button` primary "Ghi nhận khoản vay mới" mở `BorrowPositionForm` (mục 3).
- Danh sách `BorrowPositionCard` (mục 4), mới nhất trước; rỗng → text "Chưa có khoản vay nào được ghi nhận."
- Loading danh sách: "Đang tải...". Lỗi tải: `InlineAlert` + `Button` secondary "Thử lại".

### 2. `AvailableCapitalWidget` (BR-010, `GET /api/ledger/available-capital`)
- Hiển thị `freeCapitalUsdt`, `totalReservedUsdt`, dòng "Dữ liệu tại {asOf formatted HH:MM:SS UTC dd/mm/yyyy}" — không cache, gọi lại mỗi khi dashboard mount hoặc có `Button` secondary "Làm mới".
- `personalCapitalUsdt` (input thủ công theo architecture Financial formulas — chưa có nguồn tự động): `TextField` riêng "Vốn cá nhân xác định (USDT)" + `Button` "Cập nhật", disabled khi đang gửi. Đây là số user tự khai báo, không suy từ balance Binance (khớp AGENTS.md "không suy provenance từ balance") — ghi chú nhỏ dưới input: "Số bạn tự xác nhận là vốn cá nhân, không lấy từ balance Binance."
- Lỗi tải: `InlineAlert` "Không thể tải số liệu vốn khả dụng, vui lòng thử lại."

### 3. `BorrowPositionForm` (US-001, AC-001, AC-002, BR-002)
- `TextField` "Tài sản vay" (ví dụ ZEC, WLD — free text, uppercase tự động khi submit không hiển thị lại cho user).
- `TextField` "Số lượng vay" (decimal, native unit).
- `TextField` "Giá tại thời điểm vay đầu tiên (first_borrow_entry_price, USDT)".
- Dòng cảnh báo tĩnh: "Giá này KHÔNG thể sửa sau khi lưu — kiểm tra kỹ trước khi xác nhận."
- `Button` primary "Ghi nhận khoản vay" → gửi kèm header `Idempotency-Key` (UUID sinh mới mỗi lần mở form/submit lần đầu, giữ nguyên nếu user bấm lại do lỗi mạng mà chưa có response — xem Idempotency).
- 409 (đã có OPEN cùng asset — AC-002): `InlineAlert` "Bạn đang có khoản vay {asset} chưa trả hết. Phải ghi nhận trả hết khoản vay cũ trước khi mở khoản vay mới cùng tài sản này." Form không tự chuyển hướng, user tự đóng.
- Thành công: đóng form, `BorrowPositionCard` mới xuất hiện trong danh sách, status OPEN.

### 4. `BorrowPositionCard` (AC-005, AC-006, AC-007, AC-011)
Hiển thị: `borrowedAsset`, `quantity`, `firstBorrowEntryPrice`, `liabilityLedger` (kèm đơn vị native asset, KHÔNG phải USDT — ghi rõ "{liability} {borrowedAsset}"), `reservedAmountUsdt`, `status`.

| `status` | UI |
|---|---|
| `OPEN` | `InlineStatus` "Đang mở" + action buttons: "Ghi nhận bán tài sản vay" (mục 5), "Ghi nhận trả nợ" (mục 8), "Đối chiếu với Binance" (mục 9) |
| `REPAID` | `InlineStatus` "Đã trả hết" (màu trung tính, không phải success rực rỡ vì đây là trạng thái kết thúc, không phải hành động vừa thành công) — ẩn các action ghi event mới (BR-006 terminal), vẫn hiện link "Xem lịch sử" (mục 10) |
| `DRIFT_DETECTED` | `InlineAlert` "Phát hiện lệch số liệu — xem chi tiết bên dưới." + `DriftPanel` (mục 9b); TẤT CẢ action khác (bán, trả nợ) ẩn/disable kèm chú thích "Đã khoá thao tác cho tới khi xử lý xong lệch số liệu" (BR-009) |

Danh sách `AllocationLotCard` (mục 6) funded từ position này hiển thị thu gọn bên trong card (expand/collapse), vì 1 Borrow Position có thể funding nhiều lot.

### 5. `SellAssetForm` (ASSET_SOLD, US-002)
- `TextField` "Số lượng {borrowedAsset} đã bán", `TextField` "Số USDT thực nhận (sau phí)".
- Ghi chú tĩnh: "Nhập đúng số USDT thực nhận sau khi trừ phí, không phải giá niêm yết." (khớp Financial definitions của requirement).
- `Button` primary "Ghi nhận" (Idempotency-Key mới).
- Thành công: đóng form, không có số liệu mới hiển thị trực tiếp ở form này (proceeds này chưa gắn vào lot nào — chỉ là USDT trung gian, user tiếp tục bằng `AllocationLotForm`).

### 6. `AllocationLotForm` (ASSET_BOUGHT, US-003, US-008, AC-003, AC-004)
- `SelectField` "Tài sản" — options cố định: BTC, ETH (khớp enum `AllocationAsset`, loại SOL — AC-009: nếu cần hiển thị lý do, thêm option disabled "SOL (chưa hỗ trợ)" hoặc đơn giản không liệt kê SOL — chọn **không liệt kê** để tránh user chọn rồi mới báo lỗi).
- `TextField` "Số lượng mua", `TextField` "Tổng chi phí (USDT)".
- `SelectField` "Nguồn vốn" — options: "Vốn cá nhân" (PERSONAL) | mỗi Borrow Position đang OPEN của user, label "{borrowedAsset} — vay ngày {createdAt}" (value = borrowPositionId).
- Không có lựa chọn "nhiều nguồn" (BR-003/US-008) — UI chỉ cho chọn **1** nguồn duy nhất bằng thiết kế (radio/select đơn), nên AC-004 (từ chối mixed-source) chủ yếu là server-side guard cho trường hợp client bị bypass (vd. gọi API trực tiếp) — form không có cách nào tự nhiên tạo ra request mixed-source, nhưng nếu server vẫn trả 422 (do race hoặc client cũ), hiển thị `InlineAlert` "Không thể ghi nhận: 1 lot chỉ được gắn với đúng 1 nguồn vốn. Vui lòng tách thành các lần mua riêng theo từng nguồn."
- Thành công: `AllocationLotCard` mới xuất hiện trong danh sách của position tương ứng (nếu nguồn = Borrow Position) hoặc trong mục "Lot vốn cá nhân" riêng (nếu PERSONAL — mục 7).

### 7. `AllocationLotCard` (hiển thị trong `BorrowPositionCard` hoặc mục riêng "Lot vốn cá nhân")
- Hiển thị `asset`, `quantity`, `remainingQuantity`, `costBasisUsdt`.
- `remainingQuantity = 0`: `InlineStatus` "Đã bán hết", ẩn action bán.
- `remainingQuantity > 0`: `Button` secondary "Ghi nhận bán lot" mở `SellLotForm` (mục 8).

### 8. `SellLotForm` (LOT_SOLD, US-004, AC-005)
- Hiển thị tĩnh `remainingQuantity` hiện tại để user đối chiếu.
- `TextField` "Số lượng bán", `TextField` "Số USDT thực nhận (sau phí)".
- Nếu lot funded từ Borrow Position: banner tĩnh TRƯỚC khi submit — "Toàn bộ {proceedsUsdt nhập} USDT sẽ được GIỮ LẠI (reserved) để trả nợ {borrowedAsset}, không dùng làm vốn tự do cho tới khi trả hết khoản vay này." (US-004, BR-005 — bắt buộc hiển thị TRƯỚC khi user bấm xác nhận, không chỉ sau khi lưu).
- Nếu lot funded PERSONAL: không có banner reserve (không áp dụng BR-005).
- 422 (`quantitySold > remainingQuantity`): `InlineAlert` "Số lượng bán vượt quá số còn lại ({remainingQuantity})."
- Thành công: cập nhật `remainingQuantity`, nếu funded từ Borrow Position thì `reservedAmountUsdt` của card cha cũng cập nhật theo (re-fetch).

### 8b. `RepayForm` (REPAY, US-005, AC-006, AC-011)
- Hiển thị tĩnh `liabilityLedger` hiện tại ("{liability} {borrowedAsset}").
- `TextField` "Số lượng trả nợ ({borrowedAsset})".
- `Button` primary "Ghi nhận trả nợ".
- 422 overpayment (`amount > liabilityLedger`, COND-004/OQ-P05): `InlineAlert` "Số tiền trả vượt quá liability hiện tại. Đây là trường hợp cần xử lý thủ công (MVP chưa hỗ trợ tự động) — vui lòng dùng chức năng Correction (mục 10) để ghi chú và điều chỉnh, hoặc liên hệ xử lý ngoài hệ thống." Không cho phép submit lại với cùng số cho tới khi user sửa giá trị hoặc dùng Correction.
- Thành công, status chuyển REPAID: `InlineStatus` "Đã trả hết khoản vay. {reservedAmountUsdt cũ nếu >0} USDT đã được giải phóng thành vốn tự do." — nếu response kèm event `DUST_WRITTEN_OFF` (dust khác 0 nhưng trong ngưỡng — hiện mặc định ngưỡng = 0 nên case này hiếm ở MVP, xem COND-001b): hiển thị thêm dòng "Phần dư {amount} {borrowedAsset} được bỏ qua (dust), không tính là lãi/lỗ."
- Thành công, status vẫn OPEN (trả một phần): cập nhật `liabilityLedger` hiển thị, không có thông báo đặc biệt.

### 9. `ReconcileButton` + 9b. `DriftPanel` (AC-007, BR-009)
- `Button` secondary "Đối chiếu với Binance" trên mỗi `BorrowPositionCard` trạng thái OPEN.
- Đang gọi: `InlineStatus` "Đang đối chiếu với Binance...".
- Kết quả khớp (không đổi status): `InlineStatus` thoáng qua "Đã đối chiếu, số liệu khớp." (tự ẩn sau vài giây hoặc tới lần render tiếp theo — implementation detail).
- Kết quả lệch → status DRIFT_DETECTED, hiển thị `DriftPanel`:
  - 2 số song song: "Ledger nội bộ: {liabilityLedger} {borrowedAsset}" vs "Binance (lúc {reconciledAt}): {liabilityBinanceLast} {borrowedAsset}".
  - Text giải thích: "Hệ thống phát hiện lệch giữa số liệu ghi nhận và số liệu thực tế trên Binance. Các thao tác ghi nhận mới cho khoản vay này đã bị khoá cho tới khi bạn xử lý."
  - `Button` primary "Tôi đã xử lý, tạo ghi chú điều chỉnh" → mở `CorrectionForm` (mục 10) được prefill `borrowPositionId`.
- Timeout/lỗi đọc Binance (`RECONCILE_UNKNOWN`): `InlineAlert` "Không thể đối chiếu lúc này (mất kết nối hoặc hết thời gian chờ với Binance), trạng thái khoản vay KHÔNG đổi." + `Button` secondary "Thử lại" — rõ ràng phân biệt với "đã đối chiếu, khớp" (AGENTS.md: timeout ≠ thất bại/thành công).

### 10. `CorrectionForm` + lịch sử event (AC-008, US-006 phần "xử lý thủ công")
- Truy cập từ: (a) nút "Xem lịch sử" trên mỗi `BorrowPositionCard`/`AllocationLotCard`, (b) nút "Tôi đã xử lý" trong `DriftPanel`.
- `LedgerEventHistoryTable`: bảng chuẩn (`<table>`, `<th scope="col">`) cột Thời gian / Loại sự kiện / Chi tiết (render `payload` dạng key:value đơn giản) / Ghi chú (nếu là `CORRECTION`, hiển thị "Điều chỉnh cho sự kiện {correctsEventId}"). Mỗi event gốc (không phải CORRECTION) có `Button` secondary nhỏ "Tạo điều chỉnh".
- `CorrectionForm` (mở khi bấm "Tạo điều chỉnh" hoặc từ DriftPanel): `TextField` "Lý do điều chỉnh" (bắt buộc, text tự do — ghi vào payload để audit), các field số liệu tương ứng loại event gốc (ví dụ sửa lại `proceedsUsdt` của 1 `LOT_SOLD`).
- Dòng cảnh báo tĩnh: "Sự kiện gốc KHÔNG bị xoá hay sửa — hệ thống chỉ thêm một bản ghi điều chỉnh mới, có thể xem lại toàn bộ lịch sử bất cứ lúc nào." (BR-008, tăng niềm tin append-only cho user).
- Thành công: đóng form, bảng lịch sử có thêm dòng `CORRECTION`, số liệu liên quan (reservedAmountUsdt/liabilityLedger/status) cập nhật theo.

## Idempotency (frontend trách nhiệm, khớp COND-002)
Mỗi form ghi event (`BorrowPositionForm`, `SellAssetForm`, `AllocationLotForm`, `SellLotForm`, `RepayForm`, `CorrectionForm`) sinh 1 `Idempotency-Key` (`crypto.randomUUID()`) **khi form được mở/reset**, giữ nguyên key đó cho mọi lần bấm submit của cùng phiên nhập liệu đó (kể cả khi lỗi mạng và user bấm lại) — chỉ sinh key mới khi form đóng/reset sau thành công hoặc user huỷ. Tránh 2 lỗi ngược nhau: sinh key mới mỗi lần bấm (mất tác dụng chống double-submit khi retry) hoặc dùng 1 key cố định toàn phiên (vô tình coi 2 lần nhập liệu khác nhau là trùng).

## Accessibility
- Giữ nguyên quy ước từ `design/binance-read-only-connection.md`: `InlineAlert` role="alert", `InlineStatus` role="status", tên nút luôn là text rõ nghĩa, không icon-only.
- `SelectField` (mới) giữ `label`/`htmlFor`/`id` giống `TextField`.
- `LedgerEventHistoryTable` dùng `<th scope="col">` cho header, mỗi hàng có đủ ngữ cảnh text (không dựa vào màu sắc để phân biệt loại event).
- Banner reserve (mục 8, SellLotForm) và banner "KHÔNG thể sửa" (mục 3) phải nằm trong luồng đọc trước nút submit, không phải tooltip/hover-only — đảm bảo screen reader đọc được trước khi xác nhận.

## Financial/confirm invariants (theo AGENTS.md)
Feature không gọi Binance write (không phải financial execution thật), nhưng vì là dữ liệu tài chính append-only, mọi form ghi event có bước nhập → xem lại số liệu trên form → bấm nút xác nhận rõ nghĩa (không auto-submit khi blur/change). Banner reserve (BR-005) và banner immutable (`firstBorrowEntryPrice`) bắt buộc hiển thị TRƯỚC khi bấm nút, không phải chỉ trong thông báo kết quả — khớp yêu cầu "preview rồi mới confirm" áp dụng tinh thần cho ghi nhận nội bộ. Không có alert/score nào trong feature này tự động điền hoặc tự submit form.

## Unresolved / handoff cho backend-agent + frontend-agent
- **U-D01**: `AllocationLotForm` liệt kê Borrow Position OPEN để chọn làm nguồn — cần API `GET /api/ledger/borrow-positions?status=OPEN` hoặc filter client-side từ list đã có. Không chặn design READY (cả 2 cách đều có spec UI giống nhau), backend-agent chọn theo khả năng API hiện có.
- **COND-001b/OQ-C01** (ngưỡng dust native-unit) kế thừa từ architecture: UI không hardcode giá trị ngưỡng, chỉ phản ánh response server (REPAID có kèm `DUST_WRITTEN_OFF` hay không) — khi BA/user chốt giá trị khác 0, không cần đổi spec UI này.
- Không còn open question nào ảnh hưởng implementation UI của chính feature này — mọi trạng thái bắt buộc theo AGENTS.md (reserved funds, estimated vs actual N/A vì không có estimate, partial/unknown qua DriftPanel/RECONCILE_UNKNOWN, loading/error/empty) đã có spec.

## Đề xuất trạng thái
design_status: READY — mọi màn hình/trạng thái bắt buộc theo AC-001..AC-010 (+AC-011 đề xuất) đã có spec, common component mapping đầy đủ (1 component mới `SelectField` có lý do rõ ràng, không trùng lặp pattern có sẵn), không còn open question chặn implementation UI. U-D01 là câu hỏi kỹ thuật nhỏ có fallback ở cả 2 nhánh.
