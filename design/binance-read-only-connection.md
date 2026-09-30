# Design: binance-read-only-connection

Revision: r1-2026-09-30 | Owner: coordinator (design-agent role) | Decision: features/binance-read-only-connection/decision.json

## Input
- requirements/binance-read-only-connection.md r1-2026-09-29 (sha256:169ac1c4dd000a187ecfcd150e43f8d0a74b752c485782e51b87418d25f213dc) — US-001..US-006, AC-001..AC-008
- architecture/binance-read-only-connection.md (sha256:49b994bf10431bd82b1ce4f4d4f68a80b5ed60baeff29ed754814a3e63e01210) — API contracts, `ConnectionStatus` state machine, `permissionUnknown` flag, React component boundaries (`AddConnectionForm`, `ConnectionStatusCard`, `AccountSnapshotPanel`, `RevokeConnectionButton`)
- Common component library hiện có: `frontend/src/components/common/{TextField,Button,InlineMessage}.tsx` (dùng lại nguyên bản từ design/user-authentication.md, không phát minh pattern mới)

**Giả định cần architect/coordinator xác nhận nếu sai**: `req.user.id` tới từ session (user-authentication feature, hiện IMPLEMENTATION IN_PROGRESS — BLOCKER-ARCH-001). Design này không phụ thuộc chi tiết cơ chế auth, chỉ giả định frontend đã có shell trang đăng nhập (App.tsx hiện có) để render feature này bên trong khi đã đăng nhập, giống cách `AccountLinkPanel` được render trong design/user-authentication.md mục 4.

## Common component mapping
| Common component | Dùng ở |
|---|---|
| `TextField` | Label/API key/API secret ở `AddConnectionForm` |
| `Button` (`variant="primary"`/`"secondary"`) | Submit thêm connection, Verify lại, Refresh snapshot, Revoke, Thử lại, Tạo mã mới (N/A ở đây), Đóng banner cảnh báo |
| `InlineAlert` (`role="alert"`) | Mọi lỗi: invalid key, unsupported account mode, verify_unknown, timeout/rate-limit, revoke thất bại |
| `InlineStatus` (`role="status"`) | Đang verify, verify thành công, revoke thành công, đang tải snapshot |

Không thêm common component mới. `ConnectionStatusCard` hiển thị trạng thái bằng text + `InlineAlert`/`InlineStatus` sẵn có (không cần "badge màu" riêng như gợi ý màu mè trong architecture — 1 feature dùng 1 lần chưa đủ lý do thêm component `Badge` mới vào common layer; nếu feature sau cần badge tái dùng nhiều nơi, thêm khi đó).

## Màn hình / trạng thái

### 1. `BinanceConnectionsPage` — danh sách connections (US-001, US-005, US-006)
- Heading "Kết nối Binance".
- Loading (`GET /api/binance-connections` chưa trả lời): text "Đang tải danh sách kết nối...".
- Lỗi tải danh sách: `InlineAlert` "Không thể tải danh sách kết nối, vui lòng thử lại." + `Button` secondary "Thử lại".
- Rỗng (chưa có connection nào): text hướng dẫn "Bạn chưa có kết nối Binance nào." ngay trên `AddConnectionForm`.
- Có connection: render `AddConnectionForm` (luôn hiện, cho phép thêm connection mới bất kể đã có connection khác — khớp OQ-R03 còn OPEN, xem Unresolved) phía trên danh sách; mỗi connection render một `ConnectionStatusCard` (mục 3), mới nhất trước.
- Trang này chỉ query theo `req.user.id` phía server (US-006) — không có UI cần xử lý riêng cho ownership, đã là API contract.

### 2. `AddConnectionForm` (AC-001, AC-002, AC-003, BR-004)
- 3 `TextField`: "Tên gợi nhớ" (label, text, required), "API Key" (type=text, required), "API Secret" (type=password, required).
- Dòng cảnh báo tĩnh ngay trên nút submit (copy cố định theo architecture mục UI handoff): "Chỉ nhập API key có quyền đọc (Enable Reading). Không bật Enable Spot & Margin Trading hoặc Enable Withdrawals nếu không cần."
- `Button` "Thêm kết nối" (`disabled` khi `submitting`).
- Submit: trim whitespace 2 đầu của apiKey/apiSecret trước khi gửi (Edge case requirements — trim nhưng không tự "sửa" nội dung khác); KHÔNG hiển thị lại giá trị đã trim cho user, chỉ dùng để gửi request.
- Ngay sau khi request submit thành công hoặc lỗi: form tự clear `apiKey`/`apiSecret` khỏi state (giữ nguyên "Tên gợi nhớ" nếu lỗi, để user không phải gõ lại tên) — khớp kiến trúc "form tự clear input secret khỏi state/DOM ngay".
- Đang gửi: `InlineStatus` "Đang xác minh kết nối..." (verify chạy đồng bộ trong cùng request theo architecture — không có bước "đang lưu" tách biệt "đang verify").
- Lỗi tạo (network/lỗi server không phải verify-result, vd 500 trước khi kịp verify): `InlineAlert` "Không thể tạo kết nối, vui lòng thử lại."
- Thành công (bất kể verify ra kết quả gì — server trả về connection với status): đóng form về trạng thái rỗng, connection mới xuất hiện trong danh sách dưới dạng `ConnectionStatusCard` đúng theo status trả về (không có "thành công" riêng ở form nếu status là INVALID/UNSUPPORTED — lỗi verify hiển thị ở card, không ở form, vì AC-001..AC-003 đều là "connection được lưu" trước, verify là thuộc tính của card).

### 3. `ConnectionStatusCard` (AC-001, AC-002, AC-003, AC-004, AC-008)
Mỗi card hiển thị `label`, `status`, `lastVerifiedAt` (nếu có, format "HH:MM:SS UTC dd/mm/yyyy"), và theo `status`:

| `ConnectionStatus` | UI |
|---|---|
| `PENDING_VERIFY` | `InlineStatus` "Đang xác minh..." (hiển thị ngay sau add trước khi response verify đồng bộ trả về — thời gian rất ngắn vì verify đồng bộ, nhưng vẫn cần state này cho double-click/`advisory lock` trả lại "đang xác minh") |
| `VERIFIED` | `InlineStatus` "Đã xác minh — Cross Margin Classic." + hiện `AccountSnapshotPanel` (mục 4) + `Button` secondary "Xác minh lại" |
| `INVALID` | `InlineAlert` "Kết nối không hợp lệ: API key hoặc secret sai hoặc đã hết hạn." + `Button` secondary "Xác minh lại" (cho phép user sửa key qua xoá/thêm lại — không có edit-in-place vì API không có PATCH) |
| `UNSUPPORTED_ACCOUNT_MODE` (2 lastError khác nhau — COND-002) | `InlineAlert` dùng đúng `lastError` server trả (2 message riêng biệt: "Tài khoản này là Cross Margin Pro, hệ thống chỉ hỗ trợ Cross Margin Classic." hoặc "Tài khoản chưa mở Cross Margin, vui lòng mở Cross Margin Classic trên Binance trước."); KHÔNG hardcode 1 message chung ở frontend — hiển thị nguyên văn field `lastError` từ API |
| `VERIFY_UNKNOWN` | `InlineAlert` "Không xác nhận được trạng thái (mất kết nối/hết thời gian chờ với Binance)." + `Button` secondary "Thử lại" (gọi lại verify, KHÔNG tự động retry — khớp AGENTS.md) |
| `REVOKED` | Card không hiển thị trong danh sách nữa (API `GET /api/binance-connections` loại connection đã revoke theo kiến trúc; nếu backend vẫn trả về để lịch sử, hiển thị dòng mờ "Đã thu hồi lúc {updatedAt}" không có action nào) — cần backend-agent xác nhận API list có filter theo status hay trả tất cả (Unresolved bên dưới) |

Mọi action re-verify (`Button` "Xác minh lại"/"Thử lại") gọi `POST /api/binance-connections/:id/verify`, disable nút trong lúc đang gọi, không cho double-submit (khớp advisory lock phía backend nhưng frontend cũng phải tự disable để tránh spam request).

`permissionUnknown=true` (cờ độc lập, có thể đi kèm bất kỳ status nào ngoại trừ khi chưa verify lần nào): render thêm `InlineAlert` riêng ngay dưới status chính, không thay thế: "Không xác định được quyền của API key này (không đọc được thông tin permission từ Binance). Vui lòng tự kiểm tra trên Binance để đảm bảo key chỉ có quyền đọc." (COND-003 fail-closed, KHÔNG được ẩn banner này hoặc coi permissionUnknown=false ngầm định).

`permissionSnapshot` có giá trị và cho thấy quá quyền (`enableWithdrawals=true` HOẶC `enableSpotAndMarginTrading=true` HOẶC `enableFutures=true`, theo AC-004): render `InlineAlert` "Cảnh báo: API key này có quyền vượt quá mức cần thiết ({danh sách quyền phát hiện được, vd 'rút tiền, giao dịch'}). Khuyến nghị tạo lại key chỉ bật Enable Reading." Đây KHÔNG chặn dùng connection (AC-004: "vẫn cho phép dùng ở chế độ đọc nếu user xác nhận đã hiểu rủi ro") — thêm 1 checkbox/`Button` xác nhận 1 lần "Đã hiểu, tiếp tục" để ẩn banner này cho phiên xem hiện tại (state cục bộ FE, không cần lưu server — nếu reload lại thấy banner lại, chấp nhận được vì đây là cảnh báo an toàn lặp lại có chủ đích, không phải bug).

### 4. `AccountSnapshotPanel` (AC-005, AC-008) — chỉ hiện khi `status=VERIFIED`
- Trạng thái ban đầu: chưa tự động gọi (on-demand theo requirement — "do user trigger hoặc trang load", chọn **trigger khi user mở/expand panel lần đầu**, không auto-poll sau đó) — `Button` "Xem số dư margin" nếu chưa từng load trong phiên.
- Đang tải: `InlineStatus` "Đang tải dữ liệu từ Binance...".
- Lỗi (timeout/rate-limit/network — AC-008): `InlineAlert` message riêng theo loại lỗi:
  - Timeout/network: "Không thể tải dữ liệu (mất kết nối hoặc hết thời gian chờ), vui lòng thử lại."
  - Rate limit (429 + `Retry-After`): "Binance đang giới hạn tần suất truy cập, vui lòng thử lại sau {N} giây." (N lấy từ `Retry-After` server trả)
  - `Button` secondary "Thử lại" cho cả 2 case, không tự động retry.
- Thành công: hiển thị nguyên văn (KHÔNG parse thành number, hiển thị string y hệt field Binance) bảng `userAssets`: cột Asset / Borrowed / Free / Interest / Net Asset; dòng cuối cố định "Dữ liệu tại {fetchedAt formatted HH:MM:SS UTC dd/mm/yyyy}".
- `Button` secondary "Làm mới" để gọi lại (mỗi lần bấm là 1 lần gọi tươi Binance, không cache — khớp AC-005/BR-008).
- Field null/thiếu ở response (partial response edge case): hiển thị "—" (dash), KHÔNG hiển thị "0" ngầm định (khớp docs/DOMAIN.md "missing/stale data không được im lặng thành zero").

### 5. `RevokeConnectionButton` (AC-007, US-005)
- `Button` secondary "Xoá kết nối" trên mỗi `ConnectionStatusCard` (mọi status, kể cả INVALID/UNSUPPORTED — user phải xoá được connection lỗi).
- Bấm → `window.confirm`-style xác nhận đơn giản (không phải financial confirm, giống pattern `LogoutButton` ở design/user-authentication.md): "Xoá kết nối '{label}'? Hệ thống sẽ ngừng dùng key này ngay lập tức và không thể hoàn tác." → OK mới gọi `DELETE`.
- Đang xoá: disable button, không có spinner riêng (thao tác nhanh, DB transaction).
- Thành công: `InlineStatus` thoáng qua "Đã xoá kết nối." rồi card biến mất khỏi danh sách (re-fetch list hoặc optimistic remove — implementation detail của frontend-agent, không ảnh hưởng spec UI).
- Lỗi xoá (network/500): `InlineAlert` "Không thể xoá kết nối, vui lòng thử lại." — card vẫn còn nguyên, không xoá optimistic trước khi có response thành công (tránh mất đồng bộ nếu xoá thất bại).

## Accessibility
- Mọi input `TextField` giữ `label`/`htmlFor`/`id` như common component hiện có — không viết input rời cho `AddConnectionForm`.
- Mọi lỗi dùng `InlineAlert` (`role="alert"`), mọi thông báo tiến trình/thành công dùng `InlineStatus` (`role="status"`) — không đảo role, giữ nhất quán với design/user-authentication.md.
- Tên nút (`Button` children) luôn là text rõ nghĩa ("Xác minh lại", "Xoá kết nối"...), không icon-only.
- Bảng `userAssets` dùng thẻ `<table>` chuẩn với `<th scope="col">` cho header cột (asset/borrowed/free/interest/netAsset) để screen reader đọc đúng theo hàng.
- `AddConnectionForm` field "API Secret" dùng `type="password"` để tránh shoulder-surfing, nhưng KHÔNG che field "API Key" (không phải secret theo Binance, cần user dễ kiểm tra đã gõ đúng).

## Financial/confirm invariants (theo AGENTS.md)
Feature không có financial action (chỉ đọc, không borrow/buy/sell/repay) nên không cần bước confirm giao dịch. Hai "confirm" duy nhất trong feature là: (1) xoá connection (UX confirm, không phải financial), (2) xác nhận đã hiểu rủi ro permission-too-broad (an toàn/bảo mật, không phải financial) — cả hai đều yêu cầu thao tác thủ công riêng của user, không tự động chain từ bất kỳ alert/score nào (không có alert/score trong feature này).

## Unresolved / handoff cho backend-agent + frontend-agent
- **U-D01**: `GET /api/binance-connections` có filter loại bỏ connection `status=REVOKED` khỏi response hay trả về toàn bộ kèm status? Architecture chưa nói rõ. Design giả định **filter bỏ REVOKED** (khớp US-005 "hệ thống ngừng dùng key đó ngay lập tức" — UI không cần hiển thị lại connection đã xoá). Nếu backend-agent quyết định trả về cả REVOKED để giữ lịch sử hiển thị, cần bổ sung lại UI dòng mờ đã mô tả ở mục 3 — không chặn design READY vì cả 2 phương án đều đã có spec UI tương ứng.
- **OQ-R03** (nhiều connection trùng account) và **OQ-R04** (background re-verify định kỳ) kế thừa từ architecture: KHÔNG ảnh hưởng UI của MVP hiện tại (danh sách hiển thị mọi connection user tạo dù trùng account thật; không có UI polling/scheduler nào trong scope). Khi product/user chốt và cần enforce, có thể cần thêm banner "phát hiện trùng" hoặc UI riêng cho background result — không phải rewrite spec này.
- **BLOCKER-ARCH-001** (auth prerequisite): design này không tự chọn nơi render feature (route/nav) vì phụ thuộc shell auth (`user-authentication`, hiện IMPLEMENTATION IN_PROGRESS) — frontend-agent implement `BinanceConnectionsPage` khi có route/shell đã sẵn sàng, không phải blocker cho design_status.
- Không còn open question nào ảnh hưởng implementation của chính UI feature này (mọi state bắt buộc theo AGENTS.md — mode READ_ONLY, freshness `fetchedAt`, partial/unknown qua "—" và `permissionUnknown`, loading/error/empty — đã có spec ở trên).

## Đề xuất trạng thái
design_status: READY — mọi màn hình/trạng thái bắt buộc theo requirement AC-001..AC-008 và architecture đã có spec, common component mapping đầy đủ (không thêm mới), không còn open question chặn implementation UI. U-D01 là câu hỏi làm rõ nhỏ cho backend-agent, có phương án fallback rõ ràng ở cả 2 nhánh, không phải blocker.
