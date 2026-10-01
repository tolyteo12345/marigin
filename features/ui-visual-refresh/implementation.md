# Implementation: ui-visual-refresh

Owner: coordinator (vai trò frontend-agent) | Architecture revision: 1 | Design revision: 2
Requirement revision: 2
Decision: features/ui-visual-refresh/decision.json

## Trạng thái tổng quan
Implementation rev 2, hoàn tất theo scope đã chốt ở architecture rev 1 / design rev 2. Toàn bộ test suite (cũ + mới) pass, build sạch, lint sạch (chỉ còn 1 warning pre-existing không liên quan tới thay đổi này). Đã tự chụp screenshot thật (Playwright headless Chromium, xem mục "Xác nhận trực quan" bên dưới) để verify AC-001/002/005 thay vì chỉ tin code — đóng khoảng trống mà rev 1 để lại (WARN-001/COND-001).

## Rev 2 — sửa sau phản hồi user ("quá xấu, không giống Hyperliquid")
Rev 1 chỉ áp token màu nhưng giữ nguyên layout scaffold cũ (`#root` cố định 1126px, `border-inline`, không card, không center) — screenshot thật cho thấy form tràn full-width, phần lớn màn hình trống, không giống tham chiếu Hyperliquid. Đây là lỗ hổng ở design rev 1 (thiếu spec page composition), không phải lỗi code không khớp spec. Đã quay lại design-agent bổ sung mục "Layout / composition" (`design/ui-visual-refresh.md` rev 2) trước khi sửa code — không tự ý đổi layout mà không cập nhật spec nguồn.

Thay đổi code rev 2:
- `frontend/src/index.css`: bỏ `#root { width: 1126px; border-inline; text-align:center }` (leftover scaffold). Thêm token `--radius-lg: 12px`. Thêm `.app-header` (border-bottom, padding đầy đủ thay vì `padding: 8px 0` cũ), `.app-main` (flex center 2 trục, `flex:1`), `.card` (max-width 420px, `--color-surface`, border, `--radius-lg`, `--shadow`, padding `--space-lg`). Thêm `.card .btn { width:100%; margin-top: var(--space-sm) }` để button đồng bộ chiều rộng với input (trước đó button chỉ rộng theo nội dung, lệch với input full-width — bất nhất thị giác).
- `frontend/src/App.tsx`: bọc nội dung mỗi nhánh (đăng nhập/chưa đăng nhập) trong `.app-main > .card`, `.app-header` tách riêng ở trên (không đổi logic `isLoggedIn`/`showRegister`).

## Xác nhận trực quan (đóng WARN-001/COND-001 của rev 1)
Môi trường lần này có sẵn Playwright + Chromium cache cục bộ (`npx playwright install chromium` chạy được, không cần thêm dependency vào `package.json` — chỉ dùng tạm ở ngoài repo để chụp, không phải phần app). Đã chạy `npm run dev`, chụp thật qua headless Chromium (viewport 1280×800):
- Dark theme, tab Email/Password: card căn giữa, input full-width, button full-width, tương phản rõ — khớp mô tả token.
- Light theme: cùng bố cục, màu đảo đúng theo `[data-theme='light']`.
- Tab Telegram, màn Register: cùng `.card`, không vỡ layout, nút "Đăng nhập với Telegram" full-width đồng bộ.
Không phát hiện phần tử giữ màu/layout cũ khi toggle. AC-001, AC-002 (mapping màu InlineAlert/InlineStatus không đổi so với rev 1, đã review), AC-005 coi như **PASS** (không còn NOT_RUN) dựa trên bằng chứng ảnh chụp thật này.
AccountLinkPanel (nhánh đã đăng nhập) dùng chung `.card` — chưa chụp được vì cần backend chạy thật để đăng nhập (ngoài scope frontend-only của môi trường này); về mặt cấu trúc CSS áp dụng y hệt LoginForm nên rủi ro thấp, nhưng ghi rõ đây là phần chưa có ảnh chụp trực tiếp.

## Thay đổi code
**Mới:**
- `frontend/src/theme/theme-context.ts` — `ThemeContext` (React Context), type `Theme = 'dark' | 'light'`.
- `frontend/src/theme/ThemeProvider.tsx` — đọc `localStorage['mtl-theme']` đồng bộ trong state initializer (tránh flash-of-wrong-theme), set `document.documentElement.dataset.theme`, fallback `'dark'` khi giá trị thiếu/không hợp lệ/`localStorage` throw (private mode).
- `frontend/src/theme/useTheme.ts` — hook đọc context, throw nếu dùng ngoài `ThemeProvider`.
- `frontend/src/theme/ThemeToggle.tsx` — dùng `Button` common (`variant="secondary"`), `aria-pressed`/`aria-label` theo spec design.
- `frontend/src/theme/ThemeProvider.test.tsx` — 4 test case: default dark, toggle đổi `data-theme` + label + `aria-pressed`, persist qua remount (mô phỏng reload), fallback khi `localStorage` throw.

**Sửa:**
- `frontend/src/main.tsx` — bọc `<App />` bằng `<ThemeProvider>`.
- `frontend/src/App.tsx` — thêm `.app-header` chứa `ThemeToggle` ở cả 2 nhánh (đã đăng nhập / chưa đăng nhập), không đổi logic auth hiện có.
- `frontend/src/index.css` — thay toàn bộ token cũ (palette tím, `prefers-color-scheme` media query) bằng token mới theo `design/ui-visual-refresh.md`: `--color-bg/surface/border/text-primary/text-secondary/accent/accent-hover/danger/success`, `--font-sans/mono/size-*`, `--space-*`, `--radius`. Dark ở `:root`, light override qua `:root[data-theme='light']`. Cập nhật mọi rule dùng biến cũ (`.field`, `.btn-*`, `.inline-message-*`, `.tabs`, heading, code) sang biến mới — không đổi selector/class name nào (giữ nguyên contract với component).

## Vấn đề phát hiện trong lúc implement và đã xử lý
Linter (contrast checker) phát hiện `--color-accent` ở light theme (`#00A886` như design rev 1 ban đầu ghi) không đạt WCAG AA khi dùng làm nền cho text trắng (`.btn-primary`, đo ~3.02:1) hoặc làm màu text trên nền trắng (`InlineStatus`, cùng tỷ lệ). Theo đúng handoff của design doc ("nếu contrast không đạt, quay lại design-agent cập nhật token, không tự đổi mà không ghi lại"): đã cập nhật `design/ui-visual-refresh.md` sang `#007A5E`/`#006B52` (đo lại ~5.34:1, đạt AA) và đồng bộ vào CSS. Đây là sửa token ở đúng nguồn (design doc), không phải patch rời ở CSS.

## Bằng chứng kiểm thử (đã tự chạy lại để xác minh)
```
cd frontend && npm test
Test Files  4 passed (4)
Tests       12 passed (12)
```
8 test cũ (LoginForm, AccountLinkPanel, TelegramLoginButton) không sửa gì, pass nguyên vẹn — xác nhận AC-004 (đổi CSS không phá hành vi/test hiện có). 4 test mới cho theme (AC-005, AC-006 + edge case storage-unavailable).

```
cd frontend && npm run build
✓ 31 modules transformed, built in <500ms, no errors
```

```
cd frontend && npm run lint
src/components/AccountLinkPanel.tsx:30:10: warning react(set-state-in-effect) — PRE-EXISTING, xác nhận bằng git stash -u trước khi có thay đổi này, không liên quan tới ui-visual-refresh, không thuộc scope sửa.
```
Không còn warning nào khác.

`npm run dev` khởi động thành công (port 5174), `curl` xác nhận HTML/CSS mới được serve đúng, không lỗi runtime.

## Giới hạn — chưa verify được
- AccountLinkPanel (nhánh đã đăng nhập) chưa có ảnh chụp trực tiếp — cần backend thật để đăng nhập, ngoài khả năng môi trường frontend-only hiện tại. CSS áp dụng đồng nhất (cùng `.card`) nên rủi ro thấp nhưng chưa PASS bằng ảnh chụp như 4 màn hình còn lại (Login × 2 tab, Register, Telegram tab — xem mục "Xác nhận trực quan" ở trên).
- Contrast được tính thủ công theo công thức WCAG (relative luminance) cho các cặp token chính (`--color-accent` trên nền/text trắng ở light theme); chưa chạy công cụ đo tự động toàn diện cho mọi cặp trong bảng token (vd. `--color-text-secondary` trên `--color-surface`) — nếu QA phát hiện cặp nào không đạt, quay lại design doc để cập nhật, theo đúng quy trình đã áp dụng ở trên.
- Responsive/mobile layout không nằm trong scope (đã ghi rõ ở requirement), chưa test trên viewport nhỏ.

## Việc còn lại trước CODE_REVIEW
Không còn cho 4/5 màn hình (đã có ảnh chụp thật, xem "Xác nhận trực quan"). AccountLinkPanel cần user tự xác nhận sau khi đăng nhập thật — không phải blocker cho review bắt đầu vì cấu trúc CSS giống hệt các màn hình đã chụp.

## Cập nhật 2026-09-30: bugfix layout màn hình đã đăng nhập
User xác nhận đúng rủi ro đã ghi ở "Giới hạn — chưa verify được" phía trên: màn hình đã đăng nhập ("UI quá tệ") — nguyên nhân là `.app-main`/`.card` (thiết kế cho 1 form đăng nhập/đăng ký hẹp, `max-width:420px`) bị tái dùng nguyên trạng cho nhánh đã đăng nhập khi `binance-read-only-connection` thêm `BinanceConnectionsPage` bên cạnh `AccountLinkPanel` — 2 `.card` 420px xếp trong `.app-main` (flex row mặc định, không set `flex-direction`) bị chen chúc/xếp cạnh nhau thay vì một dashboard rõ ràng.

Sửa: thêm class mới trong `index.css` — `.dashboard` (container rộng `max-width:960px`, `align-self:flex-start` để không bị `.app-main`'s `align-items:center` canh giữa theo chiều dọc gây nội dung dài bị lệch), `.panel` (thay `.card` cho từng section lớn — Liên kết tài khoản, Kết nối Binance — giữ style border/shadow tương tự nhưng full-width thay vì 420px), `.connection-card` (1 dòng border đơn giản cho mỗi `BinanceConnection`, không lồng shadow kép bên trong `.panel`). `App.tsx` nhánh `isLoggedIn` đổi `<div className="card">` → `<section className="panel">`. Không đổi `.card`/màn hình đăng nhập-đăng ký (user không phàn nàn về màn đó).

Verify: `npx tsc -b`, `npm run build`, `npm test -- --run` (20/20 pass, không đổi so với trước fix layout vì CSS thuần không có unit test riêng cho style — chỉ có test cấu trúc/hành vi component), `npm run lint` sạch (không warning mới). Chưa chụp ảnh trực quan lại được (không có công cụ trình duyệt trong môi trường này) — cần user xác nhận layout mới đã ổn hay cần chỉnh thêm.

## Cập nhật 2026-10-01: migrate sang Tailwind CSS + phong cách near.com (rev 3)
Theo yêu cầu user (ảnh tham chiếu `.demo/*.png`, xem `design/ui-visual-refresh.md` rev 3 cho quyết định scope đã hỏi lại user trước khi làm). Thay đổi:
- Cài `tailwindcss@4.3.3` + `@tailwindcss/vite@4.3.3` (xác nhận qua `npm view` trực tiếp từ registry, peer `vite: ^5.2.0||^6||^7||^8` — khớp Vite 8.3 hiện có). Thêm `tailwindcss()` plugin vào `vite.config.ts`.
- `index.css`: thay toàn bộ class thủ công (`.btn`, `.card`, `.panel`, `.field`, `.inline-message`, `.tabs`, `.nav-*`, `.app-*`, `.connection-card`...) bằng `@import "tailwindcss";` + giữ nguyên `:root`/`:root[data-theme='light']` token (giá trị màu điều chỉnh sát near.com hơn — xem design rev 3), bỏ các token `--font-size-*`/`--space-*`/`--radius*` (dùng thang Tailwind chuẩn thay thế), giữ `--shadow`. Thêm `#root::before` cho dải accent trang trí trên cùng.
- Toàn bộ component (`Button`, `TextField`, `InlineMessage`, `LoginForm`, `RegisterForm`, `TelegramLoginButton`, `LogoutButton`, `AccountLinkPanel`, 5 component Binance, `AppShell`, `NavSidebar`, `LoginPage`, `NotFoundPage`, `LoadingShell`) viết lại class trực tiếp bằng Tailwind utility, dùng arbitrary value tham chiếu đúng CSS var hiện có (`bg-[var(--color-surface)]`...) để giữ nguyên cơ chế theme-switching, không cần đổi `ThemeProvider`/`architecture/ui-visual-refresh.md`.
- Thêm `frontend/src/navigation/icons.tsx` (2 icon SVG inline cho nav item, không thêm icon-library dependency) và `frontend/src/styles.ts` (`panelClassName` dùng chung giữa `AccountPage`/route Binance, tránh lặp chuỗi Tailwind dài).
- `TelegramLoginButton` thêm prop `fullWidth` (mặc định `false`) để giữ đúng hành vi cũ: full-width khi dùng trong `.card` (LoginPage), auto-width khi dùng trong panel (AccountLinkPanel) — trước đây đạt được qua CSS descendant selector (`.card .btn`/`.panel .btn`), nay Tailwind utility-first không có cách tương đương nên phải expose prop tường minh.
- `NavSidebar`: đổi tên biến active state (pill nền trung tính thay vì viền trái + tint accent, theo near.com), thêm `data-open` attribute thay cho class `nav-sidebar-open` cũ (test hook ổn định hơn, không phụ thuộc tên class CSS cụ thể).

Verify: `npx tsc -b` sạch, `npx vitest run` 25/25 pass (6 file test không đổi logic, chỉ 2 assertion trong `routes.test.tsx` đổi từ kiểm tra `className` sang `data-open` attribute), `npm run build` thành công (CSS output 18KB, tăng từ 7KB do Tailwind utility — hợp lý), `npm run lint` không có warning mới (2 warning pre-existing không liên quan vẫn còn, không phải do thay đổi này). Đọc trực tiếp CSS đã build xác nhận mọi arbitrary-value class (color-mix, border-left-color, responsive `md:translate-x-0`, `aria-selected:` variant, `not-disabled:hover:`...) compile đúng, không bị Tailwind âm thầm bỏ qua.

**Giới hạn môi trường (không đổi so với trước)**: không có browser tool thật — không thể chụp ảnh so khớp trực tiếp với `.demo/*.png`. Cần user tự chạy `npm run dev`, so sánh bằng mắt với ảnh near.com đã cung cấp, trước khi coi đạt yêu cầu (COND-003 mới, due_gate DONE — xem decision.json; feature này đã DONE trước đó nhưng thay đổi diện rộng này cần xác nhận lại, không chỉ dựa vào bugfix nhỏ như rev trước).

## Đề xuất trạng thái
implementation_status: READY (rev 3, revision counter = 4 theo decision.json).
