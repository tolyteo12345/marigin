# Requirement: ui-visual-refresh

Revision: 2 | Owner: product-requirement-agent | Decision: features/ui-visual-refresh/decision.json

## Problem, user và outcome
User (chủ sản phẩm, dùng chính app để hỗ trợ quyết định vay/margin) nhận xét UI hiện tại (auth screens: login/register/logout, Binance account link panel) "quá xấu" — thiếu định hướng thị giác, khó phân biệt trạng thái, không tạo cảm giác tin cậy cho một công cụ tài chính. Mục tiêu: nâng cấp visual design của các màn hình hiện có và thiết lập nền tảng design system (common component library) theo phong cách tham chiếu **Hyperliquid** (dark theme, dense/monospace numeric data, accent màu rõ ràng cho trạng thái tích cực/tiêu cực, layout gọn), để các feature tài chính tương lai (dashboard, borrow, risk) kế thừa được ngay mà không phải tự phát minh pattern UI mới mỗi lần.

Đây là visual/design-system refresh, không đổi business logic, luồng nghiệp vụ, hay API. Outcome đo được: mọi màn hình hiện có dùng chung token màu/typography/spacing mới; common component library (`Button`, `TextField`, `InlineMessage`) có styling nhất quán theo token đó; không còn raw/unstyled control.

## Scope / MVP / non-goals
**In-scope:**
- Thiết lập design tokens (màu, typography, spacing, border-radius, elevation) lấy cảm hứng từ Hyperliquid, có cả biến thể dark và light — dark theme làm mặc định.
- Áp dụng lại styling cho các màn hình/component hiện có trong `frontend/src`: LoginForm, RegisterForm, LogoutButton, TelegramLoginButton, AccountLinkPanel.
- Áp dụng lại styling cho common component library: Button, TextField, InlineMessage.
- Trạng thái UI bắt buộc theo domain hiện có của các màn hình này: loading, error, empty/success (InlineMessage các loại), disabled — thiết kế lại visual, không đổi logic hiển thị.
- Light/dark mode: cả hai đều trong scope (user xác nhận). Cần cơ chế switch theme (toggle) và mọi component/màn hình trong scope phải hoạt động đúng ở cả hai theme.

**Out-of-scope:**
- Bất kỳ màn hình/feature mới nào chưa tồn tại (Margin Dashboard, Borrow Position, Risk Engine UI...) — chưa có backend/architecture cho các module này.
- Đổi business logic, validation rules, API contract, luồng auth.
- Mode indicator (READ_ONLY/PAPER_TRADING/LIVE) — hiện tại app chưa có khái niệm mode ở UI vì chưa có borrow/execution feature; không tự thêm khi chưa có requirement riêng.
- Responsive/mobile layout tối ưu (có thể là follow-up riêng nếu cần).

**Dependencies:** không phụ thuộc backend; không đổi READ_ONLY/PAPER_TRADING/LIVE behavior vì feature này không chạm execution.

## User stories
- US-001: Là user đăng nhập/đăng ký, tôi muốn màn hình auth có visual rõ ràng, chuyên nghiệp, để tin tưởng đây là công cụ tài chính nghiêm túc thay vì prototype.
- US-002: Là user liên kết tài khoản Binance, tôi muốn AccountLinkPanel hiển thị trạng thái kết nối (linked/unlinked/error) dễ phân biệt bằng màu/icon nhất quán với design system mới.
- US-003: Là frontend-agent triển khai feature tương lai, tôi muốn common component library có sẵn style token nhất quán để tái dùng mà không phải tự quyết định màu/spacing mỗi lần.
- US-004: Là user, tôi muốn chuyển đổi giữa dark/light theme và lựa chọn được giữ lại giữa các lần dùng app.

## Business rules
| ID | Rule + units | Source | Verification / question |
|---|---|---|---|
| BR-001 | Đây là thay đổi visual-only, không được đổi hành vi validate/submit/API call hiện có của auth và account-link flow | AGENTS.md (sửa đúng phẫu thuật, không đổi business logic ngoài yêu cầu) | Verified — ràng buộc từ nguyên tắc làm việc |
| BR-002 | Design token phải đủ để mọi trạng thái UI hiện có (loading/error/success/disabled) map được màu nhất quán, không hard-code màu rời rạc theo từng component | Yêu cầu design system | OPEN_QUESTION — design-agent xác định token set cụ thể |
| BR-003 | App hỗ trợ cả dark và light theme, dark là mặc định; lựa chọn theme của user phải được lưu lại (persist) giữa các session | User xác nhận trực tiếp (2026-09-29) | Verified |
| BR-004 | Mọi component/màn hình trong scope phải đạt độ tương phản đọc được (không hardcode màu chỉ đúng cho 1 theme) ở cả hai theme | Hệ quả của BR-003 | OPEN_QUESTION — design-agent xác định cơ chế token theo theme (CSS variables/theme object) |

## Acceptance criteria
| ID | Given / When | Then | Rule | Expected evidence |
|---|---|---|---|---|
| AC-001 | Given design system mới đã áp dụng, khi mở LoginForm/RegisterForm | UI dùng token màu/typography mới, không còn style mặc định trình duyệt (unstyled input/button) | BR-001, BR-002 | Screenshot/visual review + component test không đổi hành vi (test hiện có vẫn pass) |
| AC-002 | Given AccountLinkPanel ở trạng thái linked/unlinked/error | Mỗi trạng thái có màu/indicator phân biệt rõ theo token đã định nghĩa | BR-002 | Screenshot từng trạng thái |
| AC-003 | Given common Button/TextField/InlineMessage đã refactor style | Mọi nơi dùng component này trong app tự động nhận style mới, không cần sửa từng chỗ gọi | BR-002 | Grep usage + visual review toàn bộ màn hình |
| AC-004 | Given bộ test hiện có (unit/integration cho auth, account-link) | Chạy lại sau khi đổi UI | Tất cả pass, không có assertion nào dựa vào style bị đổi gây fail | BR-001 | Test run evidence |
| AC-005 | Given user toggle theme switch | Toàn bộ màn hình trong scope chuyển đúng dark↔light ngay lập tức, không còn phần tử giữ màu của theme cũ | BR-003, BR-004 | Screenshot cả hai theme cho từng màn hình |
| AC-006 | Given user đã chọn một theme, khi reload/mở lại app | Theme đã chọn được giữ nguyên (persist qua localStorage hoặc tương đương) | BR-003 | Manual verification / test reload |

## Financial definitions và UX
Không áp dụng — feature này không hiển thị số liệu tài chính, PnL, hay financial action nào. Nếu trong quá trình design phát hiện cần placeholder cho số liệu tài chính tương lai (vd. font monospace cho số), ghi vào design token nhưng không tạo mock data hiển thị.

## Edge cases
- Component dùng chung (Button/TextField/InlineMessage) không được thay đổi API/props theo cách phá vỡ chỗ gọi hiện tại — chỉ đổi style bên trong, giữ nguyên interface.
- Trạng thái lỗi network/API hiện có (InlineMessage error) phải giữ nguyên nội dung message, chỉ đổi trình bày.
- Không được xóa/ẩn thông tin nào đang hiển thị (label, hint text) khi redesign, trừ khi design-agent đề xuất và được duyệt.

## Open questions / risks / dependencies
- OQ-002 | Owner: design-agent | Affected gate: DESIGN | Cần xác định bộ design token cụ thể (palette hex cho cả dark/light, font family — có dùng monospace cho số liệu tương lai không, spacing scale) tham chiếu từ Hyperliquid, và cơ chế implement theme switching (CSS variables/theme object/library).
- OQ-003 (RESOLVED 2026-09-29) | User xác nhận scope tạm thời chỉ gồm 5 màn hình/component hiện có (LoginForm, RegisterForm, LogoutButton, TelegramLoginButton, AccountLinkPanel + common library), không mở rộng thêm màn hình placeholder nào khác trong feature này.
- OQ-001 (RESOLVED 2026-09-29) | User xác nhận cần cả dark và light mode → đã đưa vào BR-003, BR-004, US-004, AC-005/AC-006.

## Handoff checklist
AC-001..006 truy được về BR-001..004; scope giới hạn rõ 5 component + common library hiện có (user xác nhận, tạm thời), đủ cho BA feasibility (không có financial/API risk vì không đổi logic). Token cụ thể và cơ chế theme switching (OQ-002) gắn nhãn OPEN_QUESTION cho design-agent, chưa tự chốt. OQ-001 và OQ-003 đã resolved qua xác nhận trực tiếp của user. Đề xuất `requirement_status: READY` để BA review — feasibility ở đây chủ yếu là xác nhận scope không đụng invariant tài chính nào (đã rà: không có), không cần verify API/financial vì feature không execution.
