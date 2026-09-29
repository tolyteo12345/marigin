# Design: user-authentication

Revision: r1-2026-09-29 (retrofit) | Owner: coordinator (design-agent role) | Decision: features/user-authentication/decision.json

**Ghi chú retrofit**: design-agent được thêm vào workflow (AGENTS.md, workflows/feature-development.md) sau khi frontend feature này đã implement xong (features/user-authentication/implementation.md). Tài liệu này viết lại spec khớp với UI đã tồn tại (source of truth: `frontend/src/components/*`, đã refactor sang common component layer trong cùng đợt), không phải spec đi trước code. Đóng BLOCKER-DESIGN-001. Không phát sinh thay đổi code — nếu spec ở đây lệch với code, code là sự thật và cần sửa spec, ghi rõ trong history.

## Input
- requirements/user-authentication.md r3 (US-001..US-008, BR-001..BR-016, AC-001..AC-011)
- architecture/user-authentication.md (API contracts, state machine `TelegramLoginRequest`)
- Code hiện có: `frontend/src/App.tsx`, `frontend/src/components/{LoginForm,RegisterForm,AccountLinkPanel,LogoutButton,TelegramLoginButton}.tsx`, `frontend/src/components/common/`

## Common component mapping
Toàn bộ UI của feature dùng 4 component trong `frontend/src/components/common/`, không có pattern one-off nào ngoài common:
| Common component | Dùng ở |
|---|---|
| `TextField` (label + input, id qua `useId`) | Email/Password ở LoginForm, RegisterForm, AccountLinkPanel (link-local form) |
| `Button` (`variant="primary"` mặc định, `variant="secondary"`) | Mọi nút submit/toggle/retry |
| `InlineAlert` (`role="alert"`) | Mọi thông báo lỗi |
| `InlineStatus` (`role="status"`) | Thông báo thành công/tiến trình không phải lỗi |

Không thêm pattern UI mới ngoài 4 component trên cho feature này.

## Màn hình / trạng thái

### 1. Chưa đăng nhập — `LoginForm` (AC-003, AC-004, AC-005/5b/5c)
- Tabs (`role="tablist"`, 2 tab `role="tab"` + `aria-selected`): "Email/Password" | "Telegram". Mặc định tab Email/Password.
- **Tab Email/Password**: `TextField` Email (type=email, required) + `TextField` Password (type=password, required) → `Button` "Đăng nhập" (`disabled` khi `submitting`).
  - Lỗi (sai email/password, account khoá): `InlineAlert` với **đúng 1 câu cố định** "Email hoặc password không đúng." — không bao giờ hiển thị lý do thật từ backend (BR-010/AC-004, chống leak account existence). Đây là invariant bảo mật, không phải copy tuỳ ý — không đổi khi viết lại UI trong tương lai.
- **Tab Telegram**: render `TelegramLoginButton` label "Đăng nhập với Telegram" (spec ở mục 3).
- Dưới form: `Button` (secondary) toggle sang màn Đăng ký: "Chưa có tài khoản? Đăng ký".

### 2. Chưa đăng nhập — `RegisterForm` (AC-001, AC-002)
- `TextField` Email (required) + `TextField` Password (required, `minLength=8` — UX hint only, BR-015 enforce thật ở backend).
- Dòng hint tĩnh: "Password tối thiểu 8 ký tự."
- `Button` "Đăng ký" (disabled khi submitting).
- Lỗi: `InlineAlert` — "Email đã được sử dụng." (409, AC-002) hoặc "Không thể đăng ký, vui lòng thử lại." (lỗi khác).
- `Button` (secondary) toggle ngược lại: "Đã có tài khoản? Đăng nhập".

### 3. `TelegramLoginButton` — state machine dùng chung cho luồng login và luồng link (AC-005/5b/5c, AC-007)
Component nhận `label` để đổi copy theo ngữ cảnh gọi (login vs link), state nội bộ độc lập với AC-005c (server-side, không tin client).

| Phase | UI |
|---|---|
| `idle` / `starting` | `Button` với `label` truyền vào (login: "Đăng nhập với Telegram"; link: "Liên kết Telegram"), `disabled` khi `starting` |
| `waiting` | khối `role="status"` (style `.inline-message-status`): "Đang chờ xác nhận trên Telegram...", "Còn lại: {n}s" (đếm ngược tới `expiresAt`), gợi ý "Nếu tab không tự mở, bấm lại nút để thử lại." khi có deep link |
| `claimed` | `InlineStatus`: "Đã xác nhận, đang chuyển hướng..." → parent (`onClaimed`) điều hướng/refresh |
| `rejected` | khối `role="alert"`: lý do (mặc định "Phương thức này đã được liên kết với một tài khoản khác.", AC-007 reject path) + `Button` secondary "Tạo mã mới" |
| `expired` | "Mã đã hết hạn." + `Button` secondary "Tạo mã mới" |
| `error` (network/API lỗi) | khối `role="alert"`: "Không thể kết nối tới máy chủ, vui lòng thử lại." + `Button` secondary "Thử lại" |

Poll `GET /telegram/status/:code` mỗi ~2s trong `waiting` (kill timer khi rời phase); đây là "freshness" duy nhất của feature này — không có khái niệm estimated/actual hay reserved funds (feature không chạm tài chính, xem requirements mục "Financial definitions và UX").

### 4. Đã đăng nhập — shell (`App.tsx`)
`LogoutButton` (secondary, xác nhận qua `window.confirm` — không phải financial confirm, theo yêu cầu requirements) + `AccountLinkPanel` ngay dưới.

### 5. Đã đăng nhập — `AccountLinkPanel` (AC-007, AC-008)
- Loading: text "Đang tải..." trong lúc `GET /me` chưa trả lời.
- Lỗi tải: `InlineAlert` "Không thể tải trạng thái tài khoản."
- Trạng thái: heading "Liên kết tài khoản" + list 2 dòng "Email/Password: {Đã liên kết|Chưa liên kết}", "Telegram: {Đã liên kết|Chưa liên kết}".
- Nếu Telegram chưa liên kết: render `TelegramLoginButton` label "Liên kết Telegram" (dùng lại state machine mục 3).
- Nếu local credential chưa có: form `TextField` Email + `TextField` Password (`minLength=8`) → `Button` "Thêm email + password"; lỗi `InlineAlert` ("Phương thức này đã được liên kết với một tài khoản khác." khi 409, hoặc "Không thể liên kết, vui lòng thử lại."); thành công → `InlineStatus` "Đã thêm email + password." (AC-008 happy path).
- Cả 2 form/nút chỉ hiện khi phương thức tương ứng CHƯA liên kết — không bao giờ hiện đồng thời link + đã-liên-kết cho cùng phương thức (AC-007/AC-008 "chỉ khi CHƯA thuộc user nào khác/CHƯA được dùng").

## Accessibility
- Mọi input có `label` gắn qua `htmlFor`/`id` (test dựa vào `getByLabelText`) — bắt buộc giữ khi sửa `TextField`.
- Lỗi luôn `role="alert"`, thành công/tiến trình luôn `role="status"` — không đổi role khi thêm màn hình mới cho feature này (screen reader announce khác nhau: alert ngắt ngay, status polite).
- Tên nút (`Button` children) là accessible name duy nhất — không thêm icon-only button không có text cho feature này.

## Financial/confirm invariants (theo AGENTS.md)
Feature này không có financial action nào (không borrow/buy/sell/repay). Duy nhất có "confirm" là logout — `window.confirm` đơn giản, đúng yêu cầu requirements "không phải financial confirm". Không có bước nào trong 5 màn hình trên tự chain sang hành động khác mà không qua thao tác thủ công tiếp theo của user (đúng BR-003: link chỉ xảy ra khi user chủ động chọn và hoàn tất xác thực phương thức B).

## Unresolved / handoff
Không còn open question ảnh hưởng implementation — đây là spec khớp code đã chạy qua test (8/8 pass) và build sạch, xem features/user-authentication/implementation.md. Nếu feature này có thêm màn hình mới trong tương lai (vd. forgot-password nếu BR-016 đổi), design-agent phải viết spec trước, không code trước như retrofit này.

## Đề xuất trạng thái
design_status: READY (retrofit, khớp implementation hiện có, không blocker).
